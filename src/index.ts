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
 * import portofino from 'portofino-react-admin';
 *
 * const { dataProvider, authProvider } = portofino('http://localhost:8080/demo-tt/api');
 *
 * const App = () => (
 *     <Admin dataProvider={dataProvider} authProvider={authProvider}>
 *         <!-- Resources here -->
 *     </Admin>
 * );
 *
 * export default App;
 */
export default (portofinoApiUrl: string, underlyingHttpClient = fetchUtils.fetchJson, renewTokenAfterSeconds = 600): {
    dataProvider: DataProvider,
    authProvider: AuthProvider,
    initialization: Promise<void>
} => {
    if(portofinoApiUrl.endsWith("/")) {
        portofinoApiUrl = portofinoApiUrl.substring(0, portofinoApiUrl.length - 1);
    }
    const resources: { [resource: string]: DataProvider } = {};
    let loginUrl = `${portofinoApiUrl}/login`;
    let lastRenew = new Date().getTime();
    const httpClient = (url, options: Options | { noRenew: boolean } = {}) => {
        function renewToken() {
            return httpClient(`${loginUrl}/:renew-token`, {
                method: 'POST', noRenew: true
            }).then(response => {
                localStorage.setItem('jwt', response.body);
                return request();
            }).catch(e => {
                if (e.status == 401) {
                    localStorage.removeItem('jwt');
                }
                return Promise.reject(e);
            });
        }

        function request() {
            let jwt = localStorage.getItem('token');
            return underlyingHttpClient(url, {
                user: {
                    authenticated: !!jwt,
                    token: `Bearer ${jwt}`
                },
                ...options
            });
        }

        if(localStorage.getItem('token') && renewTokenAfterSeconds >= 0 && !options['noRenew']) {
            const now = new Date().getTime()
            if(now - lastRenew > renewTokenAfterSeconds * 1000) {
                lastRenew = now;
                return renewToken();
            }
        }

        return request();
    };
    let initialization = underlyingHttpClient(`${portofinoApiUrl}/:description`).then(({ json }) => {
        if(json && json.loginPath) {
            loginUrl = `${portofinoApiUrl}${json.loginPath}`;
        }
    });

    const invokeDataProvider = function<T>(resource, method, params): Promise<T> {
        if(!resources[resource]) {
            return new Promise<T>(function (resolve, reject) {
                httpClient(`${portofinoApiUrl}/${resource}/:classAccessor`)
                    .then(({ json }) => {
                        let crud = new CrudResource(portofinoApiUrl, httpClient, json);
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
        checkAuth: () => {
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

    return { dataProvider, authProvider, initialization };
}

type HttpClient = (url, options?: Options) => Promise<{ status: number; headers: Headers; body: string; json: any; }>;

export interface ClassAccessor {
    properties: Property[];
}

export interface Property {
    name: string;
    type: string;
}

const PORTOFINO_API_VERSION_HEADER = "X-Portofino-API-Version";

export class CrudResource implements DataProvider {
    constructor(protected portofinoApiUrl, protected httpClient: HttpClient, protected classAccessor: ClassAccessor) {}

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
        let headers = new Headers();
        headers.set(PORTOFINO_API_VERSION_HEADER, "5.2");
        return this.httpClient(`${this.portofinoApiUrl}/${resource}/${params.id}`, {
            method: 'DELETE', headers
        }).then(({ json }) => {
            if(typeof json === "number") {
                //Legacy version (< 5.2) does not return which objects it deleted, only how many
                if(json == 1) {
                    return { data: { id: params.id } };
                } else {
                    return { data: { id: null } };
                }
            } else {
                //Portofino 5.2+
                return { data: { id: json[0] } };
            }
        }).catch(e => {
            if(e.status == 409) {
                //TODO show an error message
                return { data: { id: null } };
            } else {
                return Promise.reject(e);
            }
        });
    }

    deleteMany(resource: string, params: DeleteManyParams): Promise<DeleteManyResult> {
        const queryString = stringify({ id: params.ids });
        let headers = new Headers();
        headers.set(PORTOFINO_API_VERSION_HEADER, "5.2");
        return this.httpClient(`${this.portofinoApiUrl}/${resource}?${queryString}`, {
            method: 'DELETE', headers: headers
        }).then(({ json }) => {
            if(typeof json === "number") {
                //Legacy version (< 5.2) does not return which objects it deleted, only how many
                return { data: params.ids };
            } else {
                //Portofino 5.2+
                return { data: json };
            }
        }).catch(e => {
            if(e.status == 409) {
                //TODO show an error message
                return { data: [] };
            } else {
                return Promise.reject(e);
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
        let headers = new Headers();
        headers.set(PORTOFINO_API_VERSION_HEADER, "5.2");
        return this.httpClient(`${this.portofinoApiUrl}/${resource}?${queryString}`, {
            method: 'PUT', body: JSON.stringify(params.data), headers: headers
        }).then(({ headers, json }) => {
            if(headers.get(PORTOFINO_API_VERSION_HEADER)) { //Portofino 5.2+ sets this header for all API responses
                return { data: json }
            } else {
                return {
                    //Portofino < 5.2 returns the ids of the objects that have NOT been updated. Yes, that's legacy cruft.
                    data: params.ids.filter(id => json.indexOf(id) == -1)
                };
            }
        });
    }

    toPlainJson(obj: any) {
        let result = {...obj};
        if(!result.id) {
            result.id = result.__rowKey;
        }
        delete result.__rowKey;
        for (const p in result) {
            if(result.hasOwnProperty(p) && result[p].hasOwnProperty("value")) {
                result[p] = result[p].value;
                let property = this.classAccessor.properties.find(prop => prop.name == p);
                if(property) {
                    if(property.type == 'java.util.Date' || property.type == 'java.sql.Date' || property.type == 'java.sql.Timestamp') {
                        result[p] = new Date(result[p]);
                    }
                }
            }
        }
        return result;
    }
}