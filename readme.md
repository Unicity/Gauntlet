The gauntlet needs all parameters before it can be run
  Usage:

  gauntlet <parameters> [tests]

  parameters

    \-p port

    \-h host name

    \-f test file path

    \-d test files directory path

Optional arguments --verbose. Prints out the headers and output from the server for each test.

Running a specific set of tests.
  gauntlet <parameters> "testname.subTest" "testname"

_Test names are automatically URL encoded_