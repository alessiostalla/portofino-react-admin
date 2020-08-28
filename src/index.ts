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
    UpdateManyParams, UpdateManyResult
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
export default (portofinoApiUrl, httpClient = fetchUtils.fetchJson): DataProvider => {
    const resources: { [resource: string]: DataProvider } = {};
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

    return <DataProvider>({
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
}

type HttpClient = (url, options?: Options) => Promise<{ status: number; headers: Headers; body: string; json: any; }>;

export class CrudResource implements DataProvider {
    constructor(protected portofinoApiUrl, protected httpClient: HttpClient, protected classAccessor) {}

    create(resource: string, params: CreateParams): Promise<CreateResult> {
        throw "not implemented";
    }

    delete(resource: string, params: DeleteParams): Promise<DeleteResult> {
        throw "not implemented";
    }

    deleteMany(resource: string, params: DeleteManyParams): Promise<DeleteManyResult> {
        throw "not implemented";
    }

    getList(resource: string, params: GetListParams): Promise<GetListResult> {
        return this.httpClient(`${this.portofinoApiUrl}/${resource}`).then(({ headers, json }) => {
            return {
                data: json.records,
                total: json.totalRecords
            };
        });
    }

    getMany(resource: string, params: GetManyParams): Promise<GetManyResult> {
        throw "not implemented";
    }

    getManyReference(resource: string, params: GetManyReferenceParams): Promise<GetManyReferenceResult> {
        throw "not implemented";
    }

    getOne(resource: string, params: GetOneParams): Promise<GetOneResult> {
        throw "not implemented";
    }

    update(resource: string, params: UpdateParams): Promise<UpdateResult> {
        throw "not implemented";
    }

    updateMany(resource: string, params: UpdateManyParams): Promise<UpdateManyResult> {
        throw "not implemented";
    }
}