# CoCalc's Static Frontend Webapp Assets

Using webpack we build the static assets that run in the client's browser.

## Doing development

First we assume you have installed all dev dependencies everywhere, of course, for all npm packages (`npm ci`).  To do interactive development on CoCalc, you start webpack and typescript in watch mode as follows.

To do development, in one terminal session (in this package/static directory!) start webpack running

```sh
npm run webpack
```

When there are javascript-only or typescript-loader specific errors, they 
should show up here (sometimes you have to scroll up!).

In another terminal (also in this package/static directory!), start watching for errors via typescript:

```sh
npm run tsc
```

The files that are produced by webpack, and that your hub serves up are in the subdirectory `dist/`.

## Making a release

When you're ready to make a release of the static part of CoCalc, stop the above watch servers (for development), then do a clean build:

```sh
npm run build
```

This should take a significant amount of time and RAM.  Once it is done, be sure to test it using your local CoCalc server (the one running in your project), which will be using the production version of your files.  Once you're happy, use npm to publish a new version to npmjs.com.  Type `npm help version` for instructions.  In particular, you'll likely type
```sh
npm version minor -m "Description of what I did."
```
where `minor` could instead be `major` for breaking changes, `minor` for new features, and `patch` for a bugfix.

## Landmines to watch out for

### The module search path:

If there is a package installed in `packages/static/node_modules` it will get included by webpack before the same (but different version) package in `smc-webapp/node_modules`, because of what we listed in `resolve.modules` in `webpack.config.js`.  This can cause confusion. E.g., maybe an old version of the `async` library gets indirectly installed in `packages/static/node_modules`, which is wrong.   That's why a specific version of async is installed here.  The one good thing about this is it makes it easier to override modules installed in `smc-webapp/` if necessary, like we do with `pdfjs-dist` since otherwise it ends up with its own copy of webpack.