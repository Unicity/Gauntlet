Usage:

  ```gauntlet [flags] [tests]```

  flags

    -p port

    -h host name

    -f test file path

    -d test files directory path
    
    -a the base path for the test endpoints (not required)
    
    -g Google API key (for url shortening. Not required)
    
    -u JSON diff url (not required)
    
    --aws-secrect AWS secret (not required)
    
    --aws-key AWS Key (not required)
    
    --aws-bucket AWS Bucket (not required)
    
    --verbose Prints out the headers and output from the server for each test. (not required)

Running a specific set of tests.
  `gauntlet <parameters> "testname.subTest" "testname"`

_Test names are automatically URL encoded_
