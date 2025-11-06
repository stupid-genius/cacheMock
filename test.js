const Logger = require('log-ng');
const path = require('path');

Logger({logLevel: 'info', logFile: 'mochaTest.log'});
const logger = new Logger(path.basename(__filename));

const app = require('./testServer.js');

function flushLogs(){
	return new Promise((resolve) => {
		logger.on('finish', resolve);
	});
}

exports.mochaHooks = {
	beforeAll(done){
		this.testServer = app.listen(3000, 'localhost', done);
		logger.info('Test server started');
	},
	afterAll(done) {
		this.testServer.close(()=>{
			logger.info('Test server closed');
			this.testServer = null;
			logger.end();
			flushLogs().then(done);
		});
	}
};
