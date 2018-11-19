'use strict'

class API {
	constructor () {
		const FileSystem = require('fs')

		const methods = [
			'urlShortener'
		]

		for (const i in methods) {
			const method = methods[i]

			if (FileSystem.existsSync('./API/' + method)) {
				this[method] = require('./API/' + method)
			}
		}
	}
}

module.exports = new API()
