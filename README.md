# Description
portofino-react-admin is a Data provider and Auth provider to connect
a [react-admin](https://marmelab.com/react-admin/) web application with a
[Portofino 5](https://portofino.manydesigns.com) backend API.

portofino-react-admin connects to Portofino CRUD resources. It supports all
the usual SCRUD operations, including filtering, sorting and pagination. 

Also, it handles authentication with a username and a password against the
Portofino application and it will automatically send the authentication
token with each API request.

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