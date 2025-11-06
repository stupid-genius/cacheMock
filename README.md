# cacheMock
Injects mock implementations into the exports of a cached Node.js module.

 If the module is not yet in `require.cache`, it is first required to populate the cache.
 The function then merges the `mockExports` object into the existing module exports, mutating them in place.
 The original exports are shallow-copied and stored in an internal cache for later restoration.
 
 ```javascript
 const cacheMock = require('./cacheMock');
 
 cacheMock('./apiClient.js', {
   fetchData: async () => ({ mocked: true }),
   updateItem: async () => ({ success: true })
 });
 
 // service.js uses apiClient.js internally
 const service = require('./service.js');
 
 // ... run tests against service using the mock ...
 
 cacheMock.restore();
 ```
