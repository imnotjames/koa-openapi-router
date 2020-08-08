import { Context, Middleware } from 'koa';

import KoaRouter from '@koa/router';

import OpenAPIFramework, {
  BasePath,
  OpenAPIFrameworkArgs,
  OpenAPIFrameworkConstructorArgs,
  OpenAPIFrameworkOperationContext
} from 'openapi-framework';

const loggingPrefix = 'koa-openapi-router';

export interface KoaOpenAPIInitializeArgs extends OpenAPIFrameworkArgs {
  operations?: { [operationId: string]: Middleware; };
  consumers?: { [mimeType: string]: Middleware };
}

interface RouterAllowedMethodsOptions {
  /**
   * throw error instead of setting status and header
   */
  throw?: boolean;
  /**
   * throw the returned value in place of the default NotImplemented error
   */
  notImplemented?: () => any;
  /**
   * throw the returned value in place of the default MethodNotAllowed error
   */
  methodNotAllowed?: () => any;
}

export interface Router {

  /**
   * Returns router middleware which dispatches a route matching the request.
   */
  middleware(): Middleware;

  /**
   * Returns separate middleware for responding to `OPTIONS` requests with
   * an `Allow` header containing the allowed methods, as well as responding
   * with `405 Method Not Allowed` and `501 Not Implemented` as appropriate.
   */
  allowedMethods(options?: RouterAllowedMethodsOptions): Middleware;

}

// Hack because the exported typescript is broken..
function createOpenAPIFramework (frameworkArgs: OpenAPIFrameworkArgs): OpenAPIFramework {
  // @ts-ignore
  const Framework = OpenAPIFramework.default ? OpenAPIFramework.default : OpenAPIFramework;

  return new Framework(frameworkArgs) as OpenAPIFramework;
}

export function getRouter (args: KoaOpenAPIInitializeArgs): Router {
  const {
    consumers = {}
  } = args;

  const frameworkArgs: OpenAPIFrameworkConstructorArgs = {
    apiDoc: args.apiDoc,
    featureType: 'middleware',
    name: loggingPrefix,
    paths: args.paths,
    ...(args as OpenAPIFrameworkArgs)
  };

  const router = new KoaRouter();

  const framework = createOpenAPIFramework(frameworkArgs);

  framework.initialize({
    visitOperation (operationCtx: OpenAPIFrameworkOperationContext) {
      const operationId = operationCtx?.operationDoc?.operationId;
      const methodName = operationCtx.methodName;
      const basePaths = operationCtx.basePaths;

      const middleware = [
        ...createAssignApiDocMiddleware(operationCtx),
        ...createConsumesMiddleware(operationCtx, consumers),
        ...createDefaultSetterMiddleware(operationCtx),
        ...createCoercerMiddleware(operationCtx),
        ...createResponseValidatorMiddleware(operationCtx),
        ...createRequestValidationMiddleware(operationCtx),

        ...operationCtx.additionalFeatures,
        ...createSecurityMiddleware(operationCtx),

        // Finally the actual operation handler
        operationCtx?.operationHandler
      ];

      for (const basePath of basePaths) {
        router.register(
          toKoaPath(basePath, operationCtx.path),
          [methodName],
          middleware,
          { name: operationId }
        );
      }
    }
  });

  return router;
}

function createDefaultSetterMiddleware ({ allowsFeatures, features: { defaultSetter } }: OpenAPIFrameworkOperationContext): Middleware[] {
  if (!allowsFeatures || !defaultSetter) {
    return [];
  }

  return [
    (ctx: Context, next) => {
      defaultSetter.handle(toOpenAPIRequest(ctx));

      return next();
    }
  ];
}

function createResponseValidatorMiddleware ({ allowsFeatures, features: { responseValidator } }: OpenAPIFrameworkOperationContext): Middleware[] {
  if (!allowsFeatures || !responseValidator) {
    return [];
  }

  return [
    async (ctx: Context, next) => {
      await next();

      const response = responseValidator.validateResponse(
        ctx.response.status.toString(),
        ctx.response.body
      );

      if (response) {
        process.stderr.write(response.message + '\n');

        ctx.response.status = 500;
        ctx.response.body = '';
      }
    }
  ];
}

function createCoercerMiddleware ({ allowsFeatures, features: { coercer } }: OpenAPIFrameworkOperationContext): Middleware[] {
  if (!allowsFeatures || !coercer) {
    return [];
  }

  return [
    (ctx: Context, next) => {
      coercer.coerce(toOpenAPIRequest(ctx));

      return next();
    }
  ];
}

function createRequestValidationMiddleware ({ allowsFeatures, features: { requestValidator } }: OpenAPIFrameworkOperationContext): Middleware[] {
  if (!allowsFeatures || !requestValidator) {
    return [];
  }

  return [
    (ctx: Context, next) => {
      const errors = requestValidator.validateRequest(toOpenAPIRequest(ctx));

      if (errors) {
        ctx.throw(errors.status, errors);
      }

      return next();
    }
  ];
}

function createConsumesMiddleware ({ allowsFeatures, consumes }: OpenAPIFrameworkOperationContext, consumers: { [key: string]: Middleware }) {
  if (!allowsFeatures || !consumes) {
    return [];
  }

  return Object.entries(consumers)
    .filter(([mimeType]) => consumes.includes(mimeType))
    .map(consumer => consumer[1]);
}

function createAssignApiDocMiddleware ({ apiDoc, operationDoc }: OpenAPIFrameworkOperationContext): Middleware[] {
  return [
    (ctx: Context, next) => {
      ctx.state.openapi = {
        document: apiDoc,
        operation: operationDoc
      };

      return next();
    }
  ];
}

function createSecurityMiddleware ({ allowsFeatures, features: { securityHandler } }: OpenAPIFrameworkOperationContext): Middleware[] {
  if (!allowsFeatures || !securityHandler) {
    return [];
  }

  return [
    async (ctx: Context, next) => {
      await securityHandler.handle(toOpenAPIRequest(ctx));

      return next();
    }
  ];
}

function toOpenAPIRequest (ctx: Context) {
  return {
    body: ctx.request.body,
    headers: ctx.request.headers,
    params: ctx.params,
    query: ctx.request.query
  };
}

function toKoaPath (basePath: BasePath, urlPath = '/') {
  urlPath = basePath.path + '/' + urlPath.substring(1);

  return urlPath.replace(/{([^}/]+)}/g, ':$1');
}
