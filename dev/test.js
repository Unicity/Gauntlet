
const spawn = require('child_process').spawn
const http  = require('http')

const port = 49883

const server = http.createServer((request, response) => {
	response.writeHead(200, {
		'Content-Type' : 'application/json'
	})

	response.end(JSON.stringify([
		'I\'ve come to talk with you again'
	]))
})

server.listen(port, (error) => {
	if (error) {
		throw error
	}

	const gauntlet = spawn('sh', ['test.sh'])

	gauntlet.stdout.on('data', data => console.log(data.toString()))
	gauntlet.stderr.on('data', data => console.log(data.toString()))

	gauntlet.on('close', (code) => {
		process.exit(code)
	})
})
