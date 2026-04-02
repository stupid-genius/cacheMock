const { assert } = require('chai');
const fs = require('fs');
const Logger = require('log-ng');
const path = require('path');
const cacheMock = require('./cacheMock.js');

const logger = new Logger(path.basename(__filename));

const tmpModulePath = path.join(__dirname, 'tmpModule.js');

describe('cacheMock', function(){
	before(function(){
		fs.writeFileSync(tmpModulePath, `
			module.exports = {
				a: () => 'originalA',
				b: () => 'originalB',
				value: 123
			};
		`);
	});

	after(function(){
		if(fs.existsSync(tmpModulePath)){
			fs.unlinkSync(tmpModulePath);
		}
		delete require.cache[require.resolve(tmpModulePath)];
	});

	it('should apply a mock to a module and restore', function(){
		const mod = require(tmpModulePath);
		assert.equal(mod.a(), 'originalA');
		assert.equal(mod.b(), 'originalB');

		cacheMock(tmpModulePath, {
			a: () => 'mockedA'
		});

		const mocked = require(tmpModulePath);
		assert.equal(mocked.a(), 'mockedA', 'mocked function should replace original');
		assert.equal(mocked.b(), 'originalB', 'unmocked export should remain intact');

		cacheMock.restore(tmpModulePath);

		const restored = require(tmpModulePath);
		assert.equal(restored.a(), 'originalA', 'restored function should revert to original');
		assert.equal(restored.b(), 'originalB');
	});

	it('should handle mocking the same module multiple times', function(){
		cacheMock(tmpModulePath, {
			a: () => 'mockA1'
		});
		cacheMock(tmpModulePath, {
			b: () => 'mockB1'
		});

		let mocked = require(tmpModulePath);
		assert.equal(mocked.a(), 'mockA1');
		assert.equal(mocked.b(), 'mockB1');

		cacheMock.restore();
		assert.deepEqual(cacheMock.cache, {}, 'restore() should clear internal cache');

		const restored = require(tmpModulePath);
		assert.equal(restored.a(), 'originalA');
		assert.equal(restored.b(), 'originalB');
	});

	it('should handle multiple mocks and restore all', function(){
		const tmpModulePath2 = path.join(__dirname, 'tmpModule2.js');

		fs.writeFileSync(tmpModulePath2, `
			module.exports = { x: () => 'originalX', y: () => 'originalY' };
		`);

		const mod1 = require(tmpModulePath);
		const mod2 = require(tmpModulePath2);
		assert.equal(mod1.a(), 'originalA');
		assert.equal(mod2.x(), 'originalX');

		cacheMock(tmpModulePath, { a: () => 'mockA' });
		cacheMock(tmpModulePath2, { x: () => 'mockX' });

		const mocked1 = require(tmpModulePath);
		const mocked2 = require(tmpModulePath2);
		assert.equal(mocked1.a(), 'mockA');
		assert.equal(mocked2.x(), 'mockX');

		assert.equal(Object.keys(cacheMock.cache).length, 2, 'both modules should be cached');
		cacheMock.restore();
		assert.deepEqual(cacheMock.cache, {}, 'restore() should clear internal cache');

		const restored1 = require(tmpModulePath);
		const restored2 = require(tmpModulePath2);
		assert.equal(restored1.a(), 'originalA');
		assert.equal(restored2.x(), 'originalX');

		delete require.cache[require.resolve(tmpModulePath2)];
		fs.unlinkSync(tmpModulePath2);
	});

	it('should preload a module into cache without running its init code', function(){
		const tmpPath = path.join(__dirname, 'tmpSideEffectModule.js');

		fs.writeFileSync(tmpPath, `
			module.exports = { value: 123 };
			global.__sideEffectRan = true;
		`);

		cacheMock.require(tmpPath);
		assert.isUndefined(global.__sideEffectRan, 'side effect should not have executed');

		cacheMock(tmpPath, { value: 999 });
		const mod = require(tmpPath);
		assert.equal(mod.value, 999, 'mocked export is used');
		assert.isUndefined(global.__sideEffectRan, 'side effect should not have executed');

		delete require.cache[require.resolve(tmpPath)];
		fs.unlinkSync(tmpPath);
	});

	it('should preload a module with custom exports', function(){
		const tmpPath = path.join(__dirname, 'tmpPreloadModule.js');

		fs.writeFileSync(tmpPath, `module.exports = { original: true };`);

		cacheMock.require(tmpPath, { value: 999, extra: 'mocked' });

		const cached = require(tmpPath);
		assert.deepEqual(cached, { value: 999, extra: 'mocked' }, 'exports should match provided stub');

		require('fs').unlinkSync(tmpPath);
		delete require.cache[require.resolve(tmpPath)];
	});

	it('should delete a module from the cache', function(){
		const tmpPath = path.join(__dirname, 'tmpDeleteModule.js');
		fs.writeFileSync(tmpPath, `module.exports = { a: 1 };`);
		require(tmpPath);
		assert.isDefined(require.cache[require.resolve(tmpPath)]);

		cacheMock.delete(tmpPath);
		assert.isUndefined(require.cache[require.resolve(tmpPath)]);

		fs.unlinkSync(tmpPath);
	});

	it('should remove a preloaded module from cache on restore if it was originally absent', function(){
		const tmpPath = path.join(__dirname, 'tmpAbsentModule.js');
		fs.writeFileSync(tmpPath, `module.exports = {};`);
		const resolvedPath = path.resolve(tmpPath);
		delete require.cache[resolvedPath];

		cacheMock.require(tmpPath, { mocked: true });
		assert.isDefined(require.cache[resolvedPath]);

		cacheMock.restore(tmpPath);
		assert.isUndefined(require.cache[resolvedPath], 'should be removed from cache because it was not there before');

		fs.unlinkSync(tmpPath);
	});

	it('should restore the original Module object when preloading over an existing module', function(){
		const tmpPath = path.join(__dirname, 'tmpExistingModule.js');
		fs.writeFileSync(tmpPath, `module.exports = { original: true };`);
		require(tmpPath);
		const resolvedPath = require.resolve(tmpPath);
		const originalCachedModule = require.cache[resolvedPath];

		cacheMock.require(tmpPath, { mocked: true });
		assert.notStrictEqual(require.cache[resolvedPath], originalCachedModule);

		cacheMock.restore(tmpPath);
		assert.strictEqual(require.cache[resolvedPath], originalCachedModule, 'should restore original Module object');

		fs.unlinkSync(tmpPath);
		delete require.cache[resolvedPath];
	});

	it('should preserve the original state even if cacheMock.require is called multiple times', function(){
		const tmpPath = path.join(__dirname, 'tmpRedundantModule.js');
		fs.writeFileSync(tmpPath, `module.exports = { original: true };`);
		require(tmpPath);
		const resolvedPath = require.resolve(tmpPath);
		const originalCachedModule = require.cache[resolvedPath];

		cacheMock.require(tmpPath, { mock1: true });
		cacheMock.require(tmpPath, { mock2: true });

		cacheMock.restore(tmpPath);
		assert.strictEqual(require.cache[resolvedPath], originalCachedModule);

		fs.unlinkSync(tmpPath);
		delete require.cache[resolvedPath];
	});
});
