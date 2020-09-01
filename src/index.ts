import { stringify } from 'query-string';
import {
    fetchUtils,
    DataProvider,
    CreateParams,
    CreateResult,
    DeleteParams,
    DeleteResult,
    DeleteManyParams,
    DeleteManyResult,
    GetListParams,
    GetManyResult,
    GetListResult,
    GetManyParams,
    GetManyReferenceParams,
    GetManyReferenceResult,
    GetOneParams,
    GetOneResult,
    UpdateParams,
    UpdateResult,
    UpdateManyParams, UpdateManyResult, AuthProvider
} from 'ra-core';
import {Options} from "ra-core/lib/dataProvider/fetch";

/**
 * Maps react-admin queries to the Portofino 5 REST API.
 *
 * @see https://github.com/manydesigns/Portofino
 *
 * @example
 *
 * import * as React from "react";
 * import { Admin, Resource } from 'react-admin';
 * import portofinoRestProvider from 'portofino-react-admin';
 *
 * import { PostList } from './posts';
 *
 * const App = () => (
 *     <Admin dataProvider={simpleRestProvider('http://path.to.my.api/')}>
 *         <Resource name="posts" list={PostList} />
 *     </Admin>
 * );
 *
 * export default App;
 */
export default (portofinoApiUrl, underlyingHttpClient = fetchUtils.fetchJson): {
    dataProvider: DataProvider,
    authProvider: AuthProvider
} => {
    const resources: { [resource: string]: DataProvider } = {};
    let loginUrl = `${portofinoApiUrl}/login`; //TODO compute from application
    const httpClient = (url, options: Options = {}) => {
        let jwt = localStorage.getItem('token');
        return underlyingHttpClient(url, {
            user: {
                authenticated: !!jwt,
                token: `Bearer ${jwt}`
            },
            ...options
        })
    };

    const invokeDataProvider = function<T>(resource, method, params): Promise<T> {
        if(!resources[resource]) {
            return new Promise<T>(function (resolve, reject) {
                httpClient(`${portofinoApiUrl}/${resource}/:classAccessor`)
                    .then(c => {
                        let crud = new CrudResource(portofinoApiUrl, httpClient, c);
                        resources[resource] = crud;
                        crud[method](resource, params).then(resolve).catch(reject);
                    })
                    .catch(reject);
            });
        } else {
            return resources[resource][method](resource, params);
        }
    };

    const dataProvider = <DataProvider>({
        create(resource: string, params: CreateParams): Promise<CreateResult> {
            return invokeDataProvider(resource, 'create', params);
        }, delete(resource: string, params: DeleteParams): Promise<DeleteResult> {
            return invokeDataProvider(resource, 'delete', params);
        }, deleteMany(resource: string, params: DeleteManyParams): Promise<DeleteManyResult> {
            return invokeDataProvider(resource, 'deleteMany', params);
        }, getList(resource: string, params: GetListParams): Promise<GetListResult> {
            return invokeDataProvider(resource, 'getList', params);
        }, getMany(resource: string, params: GetManyParams): Promise<GetManyResult> {
            return invokeDataProvider(resource, 'getMany', params);
        }, getManyReference(resource: string, params: GetManyReferenceParams): Promise<GetManyReferenceResult> {
            return invokeDataProvider(resource, 'getManyReference', params);
        }, getOne(resource: string, params: GetOneParams): Promise<GetOneResult> {
            return invokeDataProvider(resource, 'getOne', params);
        }, update(resource: string, params: UpdateParams): Promise<UpdateResult> {
            return invokeDataProvider(resource, 'update', params);
        }, updateMany(resource: string, params: UpdateManyParams): Promise<UpdateManyResult> {
            return invokeDataProvider(resource, 'updateMany', params);
        }
    });

    const authProvider = {
        loginUrl,
        httpClient,
        login: ({ username, password }) =>  {
            const request = new Request(loginUrl, {
                method: 'POST',
                body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
                headers: new Headers({ 'Content-Type': 'application/x-www-form-urlencoded' }),
            });
            return fetch(request)
                .then(response => {
                    if (response.status < 200 || response.status >= 300) {
                        throw new Error(response.statusText);
                    }
                    return response.json();
                })
                .then(({ jwt }) => {
                    localStorage.setItem('token', jwt);
                });
        },
        logout: () => {
            return fetch(new Request(loginUrl, { method: 'DELETE' }))
                .then(response => {
                    if (response.status < 200 || response.status >= 300) {
                        throw new Error(response.statusText);
                    } else {
                        localStorage.removeItem('token');
                    }
                });
        },
        checkAuth: (p) => {
            //TODO renewal?
            return localStorage.getItem('token') ? Promise.resolve() : Promise.reject()
        },
        checkError: error => {
            const status = error.status;
            if (status === 401 || status === 403) {
                localStorage.removeItem('token');
                return Promise.reject();
            }
            return Promise.resolve();
        },
        getPermissions: () => Promise.resolve()
    };

    return { dataProvider, authProvider };
}

type HttpClient = (url, options?: Options) => Promise<{ status: number; headers: Headers; body: string; json: any; }>;

export class CrudResource implements DataProvider {
    constructor(protected portofinoApiUrl, protected httpClient: HttpClient, protected classAccessor) {}

    create(resource: string, params: CreateParams): Promise<CreateResult> {
        return this.httpClient(`${this.portofinoApiUrl}/${resource}`, {
            method: 'POST', body: JSON.stringify(params.data)
        }).then(({ headers, json }) => {
            return {
                data: this.toPlainJson(json),
                rawData: json
            };
        });
    }

    delete(resource: string, params: DeleteParams): Promise<DeleteResult> {
        return this.httpClient(`${this.portofinoApiUrl}/${resource}/${params.id}`, {
            method: 'DELETE'
        }).then(() => {
            return {
                data: { id: params.id }
            };
        });
    }

    deleteMany(resource: string, params: DeleteManyParams): Promise<DeleteManyResult> {
        const queryString = stringify({ id: params.ids });
        //TODO: at the moment, Portofino only returns the number of deleted objects, not the IDs. This will change in version 5.2 and will need a header.
        return this.httpClient(`${this.portofinoApiUrl}/${resource}?${queryString}`, {
            method: 'DELETE'
        }).then(({ json }) => {
            if(typeof json === "number") {
                //Legacy version (< 5.2) does not return which objects it deleted, only how many
                return { data: params.ids };
            } else {
                //Portofino 5.2+
                return { data: json };
            }
        });
    }

    getList(resource: string, params: GetListParams): Promise<GetListResult> {
        const queryString: any = {};
        if(params.sort && params.sort.field) {
            queryString.sortProperty = params.sort.field;
            queryString.sortDirection = params.sort.order.toLowerCase();
        }
        if(params.pagination) {
            queryString.firstResult = (params.pagination.page - 1) * params.pagination.perPage;
            queryString.maxResults = params.pagination.perPage;
        }
        if(params.filter) {
            const searchString: any = {};
            for (const filter in params.filter) {
                searchString[`search_${filter}`] = params.filter[filter];
            }
            queryString.searchString = stringify(searchString);
        }
        return this.httpClient(`${this.portofinoApiUrl}/${resource}?${stringify(queryString)}`).then(({ headers, json }) => {
            return {
                data: json.records.map(x => this.toPlainJson(x)),
                rawData: json.records,
                total: json.totalRecords
            };
        });
    }

    getMany(resource: string, params: GetManyParams): Promise<GetManyResult> {
        const self = this;
        //We can only load them one by one...
        function load(i): Promise<GetManyResult> {
            let one = self.getOne(resource, { id: params.ids[i] });
            if(i == params.ids.length - 1) {
                return one.then(result => {
                    return { data: [result.data] };
                });
            } else {
                return one.then(result => load(i + i).then(results => {
                    return { data: [result.data, ...results.data] };
                }));
            }
        }
        if(params.ids.length > 0) {
            return load(0);
        } else {
            return Promise.resolve({ data: [] });
        }
    }

    getManyReference(resource: string, params: GetManyReferenceParams): Promise<GetManyReferenceResult> {
        throw "not implemented";
    }

    getOne(resource: string, params: GetOneParams): Promise<GetOneResult> {
        return this.httpClient(`${this.portofinoApiUrl}/${resource}/${params.id}`).then(({ headers, json }) => {
            return {
                data: this.toPlainJson(json),
                rawData: json
            };
        });
    }

    update(resource: string, params: UpdateParams): Promise<UpdateResult> {
        return this.httpClient(`${this.portofinoApiUrl}/${resource}/${params.id}`, {
            method: 'PUT', body: JSON.stringify(params.data)
        }).then(({ headers, json }) => {
            return {
                data: this.toPlainJson(json),
                rawData: json
            };
        });
    }

    updateMany(resource: string, params: UpdateManyParams): Promise<UpdateManyResult> {
        const queryString = stringify({ id: params.ids });
        return this.httpClient(`${this.portofinoApiUrl}/${resource}?${queryString}`, {
            method: 'PUT', body: JSON.stringify(params.data)
        }).then(({ headers, json }) => {
            return {
                //Portofino < 5.2 returns the list of ids of the objects that have NOT been updated. Yes, that's legacy cruft.
                data: params.ids.filter(id => json.indexOf(id) == -1)
            };
        });
    }

    toPlainJson(obj: any) {
        let result = {...obj};
        delete result.__rowKey;
        for (const p in result) {
            if(result.hasOwnProperty(p) && result[p].hasOwnProperty("value")) {
                result[p] = result[p].value;
            }
        }
        return result;
    }
}