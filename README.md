# Koa OpenAPI Router

Creates a [Koa Router][koa-router] from [an OpenAPI document][openapi-doc].

This sets up the routes, body parsing, request validation,
response validation, security, and default parameters.

## Installation

Install using [npm][npm] or [yarn][yarn]

```shell script
# npm
npm install @imnotjames/koa-openapi-router

# yarn
yarn add @imnotjames/koa-openapi-router
```

## Getting Started

**WIP**

Start with an OpenAPI Document

Create Operations - similar to standard koa middleware

Define the application.

```javascript
const app = new Koa();

const router = getRouter({ apiDoc, operations });

app
  .use(router.routes())
  .use(router.allowedMethods());

app.listen(8080);
```

[koa-router]: https://github.com/koajs/router
[openapi-doc]: https://swagger.io/specification/
[npm]: https://www.npmjs.org/
