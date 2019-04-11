[![Code Climate](https://codeclimate.com/github/Unicity/Gauntlet/badges/gpa.svg)](https://codeclimate.com/github/Unicity/Gauntlet)
[![Issue Count](https://codeclimate.com/github/Unicity/Gauntlet/badges/issue_count.svg)](https://codeclimate.com/github/Unicity/Gauntlet)
[![Average time to resolve an issue](http://isitmaintained.com/badge/resolution/Unicity/Gauntlet.svg)](http://isitmaintained.com/project/Unicity/Gauntlet "Average time to resolve an issue")
[![Percentage of issues still open](http://isitmaintained.com/badge/open/Unicity/Gauntlet.svg)](http://isitmaintained.com/project/Unicity/Gauntlet "Percentage of issues still open")

Usage:

  ```gauntlet [flags] [tests]```

  flags

    -p port

    -h host name

    -f test file path

    -d test files directory path

    -a the base path for the test endpoints (optional)

    -u JSON diff url (optional)

    --shortener path to shortener config js file (optional)

    --aws-secrect AWS secret (optional)

    --aws-key AWS Key (optional)

    --aws-bucket AWS Bucket (optional)

    --verbose Prints out the headers and output from the server for each test. (optional)

Running a specific set of tests.
  `gauntlet <parameters> "testname.subTest" "testname"`

_Test names are automatically URL encoded_


###Using the converter
The format for the test file has changed the converter can convert old format to the new one.

```
./converter filename
```

This command will overwrite the old file. If you want to keep the old file I suggest making a backup.

###Using the shortener
To use the shortener you must specify a js file that looks something like:
```
const request = require('request')

module.exports = (url, callback) => {
  request.post({
    url     : 'https://example.com',
    headers : {
      'content-type' : 'application/json'
    },
    body : JSON.stringify({
      url : url
    })
  }, (error, response, body) => {
    if (error) {
      throw error
    }

    callback(JSON.parse(body).link)
  })
}
```
