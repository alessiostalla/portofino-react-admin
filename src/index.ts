/*  portofino-react-admin - a REST data provider and auth provider for react-admin against Portofino 5
 *  Copyright (C) 2020 Alessio Stalla
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

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
    UpdateManyParams, UpdateManyResult, AuthProvider, HttpError, Identifier
} from 'ra-core';
import {Options} from "ra-core/lib/dataProvider/fetch";
import {Record} from "ra-core/esm/types";
import {gte} from "semver";
import moment from "moment";
import jwtDecode from "jwt-decode";

export type PortofinoOptions = {
    httpClient?: typeof fetchUtils.fetchJson, tokenExpirationThreshold?: number, apiVersion?: string
}

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
export default (portofinoApiUrl: string, options: PortofinoOptions = {}): {
    dataProvider: DataProvider,
    authProvider: AuthProvider,
    initialization: Promise<void>
} => {
    const defaultOptions: PortofinoOptions = { httpClient: fetchUtils.fetchJson, tokenExpirationThreshold: 600, apiVersion: "5.2" };
    const portofinoOptions = {...defaultOptions, ...options};
    if(portofinoApiUrl.endsWith("/")) {
        portofinoApiUrl = portofinoApiUrl.substring(0, portofinoApiUrl.length - 1);
    }
    const resources: { [resource: string]: DataProvider } = {};
    let loginUrl = `${portofinoApiUrl}/login`;
    const httpClient = (url, options: Options | { dontRefreshToken: boolean } = {}) => {
        function refreshToken() {
            return httpClient(`${loginUrl}/:renew-token`, {
                method: 'POST', dontRefreshToken: true
            }).then(response => {
                localStorage.setItem('token', response.body);
                return request();
            }).catch(e => {
                if (e.status == 401) {
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                }
                return Promise.reject(e);
            });
        }

        function request() {
            let jwt = localStorage.getItem('token');
            return portofinoOptions.httpClient(url, {
                user: {
                    authenticated: !!jwt,
                    token: `Bearer ${jwt}`
                },
                ...options
            });
        }

        let jwt = localStorage.getItem('token');
        if(jwt && !options['dontRefreshToken']) {
            const token: any = jwtDecode(jwt);
            if(token.exp && moment().isAfter(moment((token.exp - portofinoOptions.tokenExpirationThreshold) * 1000))) {
                return refreshToken();
            }
        }

        return request();
    };
    let initialization = portofinoOptions.httpClient(`${portofinoApiUrl}/:description`).then(({ json }) => {
        if(json && json.loginPath) {
            loginUrl = `${portofinoApiUrl}${json.loginPath}`;
        }
    });

    const invokeDataProvider = function<T>(resource, method, params): Promise<T> {
        if(!resources[resource]) {
            return new Promise<T>(function (resolve, reject) {
                httpClient(`${portofinoApiUrl}/${resource}/:classAccessor`)
                    .then(({ json }) => {
                        let crud = new CrudResource(portofinoApiUrl, httpClient, json, portofinoOptions.apiVersion);
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
                .then(result => {
                    localStorage.setItem('token', result.jwt);
                    localStorage.setItem('user', JSON.stringify({
                        userId: result.userId,
                        displayName: result.displayName,
                        administrator: result.administrator,
                        groups: result.groups
                    }));
                });
        },
        logout: () => {
            return fetch(new Request(loginUrl, { method: 'DELETE' }))
                .then(response => {
                    if (response.status < 200 || response.status >= 300) {
                        throw new Error(response.statusText);
                    } else {
                        localStorage.removeItem('token');
                        localStorage.removeItem('user');
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
                localStorage.removeItem('user');
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
    constructor(protected portofinoApiUrl, protected httpClient: HttpClient, protected classAccessor: ClassAccessor,
                protected apiVersion = "5.2") {}

    create(resource, params: CreateParams) {
        return this.httpClient(`${this.portofinoApiUrl}/${resource}`, {
            method: 'POST', body: JSON.stringify(this.forUpdate(params.data))
        }).then(({ headers, json }) => {
            return {
                data: this.toPlainJson(json),
                rawData: json
            };
        });
    }

    delete<RecordType extends Record = Record>(resource, params: DeleteParams): Promise<DeleteResult<RecordType>> {
        let headers = new Headers();
        if(gte(this.apiVersion, "5.2")) {
            headers.set(PORTOFINO_API_VERSION_HEADER, "5.2");
        }
        return this.httpClient(`${this.portofinoApiUrl}/${resource}/${params.id}`, {
            method: 'DELETE', headers
        }).then(({ json }) => {
            if(typeof json === "number") {
                //Legacy version (< 5.2) does not return which objects it deleted, only how many
                if(json == 1) {
                    return { data: { id: params.id } as RecordType };
                } else {
                    return Promise.reject();
                }
            } else {
                //Portofino 5.2+
                return { data: { id: json[0] } as RecordType };
            }
        }).catch(e => {
            if(e.status == 409) {
                return Promise.reject(new HttpError(e.message || "Could not delete object, constraint violated", e.status));
            } else {
                return Promise.reject(e);
            }
        });
    }

    deleteMany(resource, params: DeleteManyParams) {
        const queryString = stringify({ id: params.ids });
        let headers = new Headers();
        if(gte(this.apiVersion, "5.2")) {
            headers.set(PORTOFINO_API_VERSION_HEADER, "5.2");
        }
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
                return Promise.reject(new HttpError(e.message || "Could not delete object, constraint violated", e.status));
            } else {
                return Promise.reject(e);
            }
        });
    }

    getList(resource, params) {
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

    getMany(resource, params) {
        const self = this;
        //We can only load them one by one...
        function load(i): Promise<GetManyResult> {
            let one = self.getOne(resource, { id: params.ids[i] });
            if(i == params.ids.length - 1) {
                return one.then(result => {
                    return { data: [result.data] };
                });
            } else {
                return one.then(result => load(i + 1).then(results => {
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

    getManyReference(resource, params) {
        return this.getList(resource, {...params, filter: {
                ...params.filter,
                [params.target]: params.id,
            }});
    }

    getOne(resource, params) {
        return this.httpClient(`${this.portofinoApiUrl}/${resource}/${params.id}`).then(({ headers, json }) => {
            return {
                data: this.toPlainJson(json),
                rawData: json
            };
        });
    }

    update(resource, params) {
        let data = this.forUpdate(params.data);
        return this.httpClient(`${this.portofinoApiUrl}/${resource}/${params.id}`, {
            method: 'PUT', body: JSON.stringify(data)
        }).then(({ headers, json }) => {
            return {
                data: this.toPlainJson(json),
                rawData: json
            };
        });
    }

    updateMany(resource: string, params: UpdateManyParams): Promise<UpdateManyResult> {
        const queryString = stringify({ id: params.ids });
        let data = this.forUpdate(params.data);
        let headers = new Headers();
        if(gte(this.apiVersion, "5.2")) {
            headers.set(PORTOFINO_API_VERSION_HEADER, "5.2");
        }
        return this.httpClient(`${this.portofinoApiUrl}/${resource}?${queryString}`, {
            method: 'PUT', body: JSON.stringify(data), headers: headers
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

    forUpdate(data) {
        data = {...data};
        for (const p in data) {
            let property = this.classAccessor.properties.find(prop => prop.name == p);
            if (property && data.hasOwnProperty(p) && data[p]) {
                if (property.type == 'java.util.Date' || property.type == 'java.sql.Date' || property.type == 'java.sql.Timestamp') {
                    data[p] = data[p].getTime();
                }
            }
        }
        return data;
    }

}