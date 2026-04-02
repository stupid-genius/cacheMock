const Logger = require('log-ng');
const Module = require('module');
const path = require('node:path');

const logger = new Logger(path.basename(__filename));

const NULL_MODULE = Symbol.for('cacheMock.nullModule');

/**
 * Injects mock implementations into the exports of a cached Node.js module.
 *
 * If the module is not yet in `require.cache`, it is first required to populate the cache.
 * The function then merges the `mockExports` object into the existing module exports, mutating them in place.
 * The original exports are shallow-copied and stored in an internal cache for later restoration.
 *
 * @function cacheMock
 * @param {string} path - The module path to mock. May be relative or absolute; resolved using `require.resolve`.
 * @param {Object<string, any>} mockExports - An object whose keys and values will be merged into the module's `exports`.
 * @throws {Error} If `require.resolve(path)` fails (e.g., module not found).
 *
 * @example
 * const cacheMock = require('./cacheMock');
 *
 * cacheMock('./apiClient.js', {
 *   fetchData: async () => ({ mocked: true }),
 *   updateItem: async () => ({ success: true })
 * });
 *
 * // service.js uses apiClient.js internally
 * const service = require('./service.js');
 *
 * // ... run tests against service using the mock ...
 *
 * cacheMock.restore();
 */
function cacheMock(path, mockExports){
	logger.debug(`Mocking module at path: ${path} with mockExports: ${JSON.stringify(mockExports, null, 2)}`);
	const resolvedPath = require.resolve(path);

	if(require.cache[resolvedPath] === undefined){
		logger.debug(`Module at path: ${path} not in cache, requiring it first.`);
		require(resolvedPath);
	}
	const cachedModule = require.cache[resolvedPath];

	cacheMock.cache[resolvedPath] ??= { ...cachedModule.exports };

	Object.assign(cachedModule.exports, mockExports);
	logger.debug(`Module at path: ${resolvedPath} exports after merging mock: ${JSON.stringify(cachedModule.exports, null, 2)}`);

	logger.debug(`Module at path: ${resolvedPath} successfully mocked.`);
	logger.silly(`Current exports: ${JSON.stringify(cachedModule.exports, null, 2)}`);
}
Object.defineProperties(cacheMock, {
	/**
	 * Internal cache storing original module states (Module object, exports copy, or NULL_MODULE).
	 *
	 * @name cacheMock.cache
	 * @type {Object<string, any>}
	 * @readonly
	 */
	cache: {
		value: {}
	},
	/**
	 * Deletes a module from the require cache.
	 *
	 * @function cacheMock.delete
	 * @param {string} modulePath - Path to the module (relative or absolute).
	 * @returns {void}
	 */
	delete: {
		value: function(modulePath){
			const resolvedPath = require.resolve(modulePath);
			logger.debug(`Deleting module from cache: ${resolvedPath}`);
			delete require.cache[resolvedPath];
		}
	},
	/**
	 * Restores previously mocked modules to their original state.
	 *
	 * If a `path` is given, only that module is restored. If omitted, all modules in the internal cache are restored.
	 * After restoration, the corresponding entries are removed from `cacheMock.cache`.
	 *
	 * @function cacheMock.restore
	 * @param {string} [path] - Optional module path to restore. If not provided, all cached mocks are restored.
	 * @returns {void}
	 *
	 * @example
	 * cacheMock.restore('./math.js'); // restore one module
	 * cacheMock.restore(); // restore all modules
	 */
	restore: {
		value: function(path){
			logger.debug(`Restoring module cache for path: ${path || 'all modules'}`);
			const entries = path ? [require.resolve(path)] : Object.keys(cacheMock.cache);

			for(const resolvedPath of entries){
				const original = cacheMock.cache[resolvedPath];
				if(original === undefined){
					continue;
				}

				if(original === NULL_MODULE){
					logger.debug(`Removing module that was originally absent: ${resolvedPath}`);
					delete require.cache[resolvedPath];
				}else if(original instanceof Module){
					logger.debug(`Restoring original module object for path: ${resolvedPath}`);
					require.cache[resolvedPath] = original;
				}else{
					// Fallback for cacheMock() which saves a copy of exports
					const cachedModule = require.cache[resolvedPath];
					if(cachedModule){
						logger.debug(`Restoring original exports for module: ${resolvedPath}`);
						cachedModule.exports = original;
					}
				}
				delete cacheMock.cache[resolvedPath];
			}
		}
	},
	/**
	 * Preload a module into `require.cache` without executing its real code. This prevents module-level side effects
	 * while allowing you to inject a stubbed module for testing or pre-mocking.
	 *
	 * @function
	 * @param {string} modulePath - Path to the module (relative or absolute).
	 * @param {Object<string, any>} [exports={}] - Optional initial exports object to assign to the stub module. Defaults to an empty object.
	 * @returns {NodeModule} The stub module object inserted into `require.cache`.
	 *
	 * @example
	 * // Preload a stub module with custom exports before loading dependents
	 * cacheMock.require('./apiClient.js', {
	 *   fetchData: async () => ({ mocked: true }),
	 *   updateItem: async () => ({ success: true })
	 * });
	 *
	 * // Now when service.js requires apiClient.js, it receives the stub
	 * const service = require('./service.js');
	 */
	require: {
		value: function(modulePath, exports = {}){
			const resolvedPath = require.resolve(modulePath);
			logger.debug(`Preloading stub module at path: ${resolvedPath}${exports ? ` with exports ${typeof exports === 'object' ? JSON.stringify(exports, null, 2) : exports}` : ''}`);

			if(cacheMock.cache[resolvedPath] === undefined){
				if(require.cache[resolvedPath] !== undefined){
					cacheMock.cache[resolvedPath] = require.cache[resolvedPath];
				}else{
					cacheMock.cache[resolvedPath] = NULL_MODULE;
				}
			}

			if(require.cache[resolvedPath] !== undefined){
				delete require.cache[resolvedPath];
			}
			logger.debug(`Creating empty cache entry for module: ${resolvedPath}`);

			const m = new Module(resolvedPath, module.parent);
			m.filename = resolvedPath;
			m.loaded = true;
			m.exports = exports;

			require.cache[resolvedPath] = m;

			logger.debug(`Module at path: ${resolvedPath} is now in cache.`);
			logger.silly(`${JSON.stringify(require.cache[resolvedPath], null, 2)}`);
		}
	}
});

module.exports = cacheMock;

