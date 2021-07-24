[![NPM](https://img.shields.io/npm/v/portofino-react-admin.svg)](https://npmjs.org/package/portofino-react-admin)

# Description
portofino-react-admin is a Data provider and Auth provider to connect
a [react-admin](https://marmelab.com/react-admin/) web application with a
[Portofino 5](https://portofino.manydesigns.com) backend API.

portofino-react-admin connects to Portofino CRUD resources. It supports all
the usual SCRUD operations, including filtering, sorting and pagination. 

Also, it handles authentication with a username and a password against the
Portofino application and it will automatically send the authentication
token with each API request.

__Note__ portofino-react-admin is not part of Portofino, it's developed
separately and it comes under a different licensing model.

## Usage

```
import portofino from 'portofino-react-admin';
   
const { dataProvider, authProvider } = portofino('http://localhost:8080/demo-tt/api');

const App = () => (
   <Admin dataProvider={dataProvider} authProvider={authProvider}>
       <!-- Resources here -->
   </Admin>
);
```

Please refer to the React Admin documentation if you're new to it.

### Options

You can pass additional options to `portofino`:

```
const { dataProvider, authProvider } = portofino(url, { ... });
```

Such options include:
 * `httpClient`: which client to use (defaults to `fetchUtils.fetchJson`). For example you can wrap `fetchJson` to 
 include additional headers that your application may require, such as an API version header.
 * `tokenExpirationThreshold` (seconds). Default is 600 (10 minutes).
 If the user performs an action on the server up to `tokenExpirationThreshold` seconds before their authentication token
 expires, the token is refreshed automatically. A longer window causes more refreshes, a shorter window may require
 users with long inactive sessions to log back in more frequently.
 * `apiVersion`. The Portofino API version to use. Defaults to 5.2. You can provide a value less than 5.2 to avoid
 sending the API version header that earlier versions of Portofino don't interpret, which can cause issues with CORS.
 
### Performing an Action After Initialization

When you call `portofino`, it makes an API call to the server URL to determine the path to the login action and other
information. If for some reason you want to run some code after this happens, you can:

```
const { dataProvider, authProvider, initialization } = portofino(url, { ... });
initialization.then(() => { ... });
``` 

## Building

`yarn && yarn build` should do the job. I guess you can also easily use npm if you adapt package.json slightly.

## License

This library is distributed under the GNU GPLv3. Please read the LICENSE file for more details.

If you'd like a more business-friendly licensing arrangement, please open an issue or contact the author privately.

## Donations

You can help me maintain this and other projects by donating to [my Patreon](https://www.patreon.com/alessiostalla).
