{
      'conditions': [
            [
              'OS=="mac"', {
                'variables': {
                    'arch%': '<!(uname -m)',
                }
              },
              'OS=="linux"', {
                'variables': {
                    'arch%': '<!(uname -m)',
                }
              },
              'OS=="win"', {
                'variables': {
                  'arch%': '<!(echo %PROCESSOR_ARCHITECTURE%)'
                }
              }
            ]
        ],
        'variables': {
          "openssl_fips" : "0",
          'msodbcsql%': 'msodbcsql17',
          'ext%': '.cpp',
          'homebrew%': '/opt/homebrew/lib/libodbc.a',
          'unixlocalodbc%': '-l/usr/local/odbc',
          'linuxodbc%': '-lodbc',
          'winodbc%': 'odbc32',
          'linkdir%': '/usr/local/lib /opt/homebrew/lib /usr/lib .'
        },

  'targets': [
    {
      'target_name': 'sqlserverv8',

      'variables': {
        'target%': '<!(node -e "console.log(process.versions.node)")', 
          # Set the target variable only if it is not passed in by prebuild 
        
        'link_path%': [
          "<!@(node -p \""
              "'<(linkdir)'"
              ".split(' ')"
              ".filter(x => require('fs')"
              ".existsSync(x))"
              ".map(x => '-L'+ x)"
              ".join(' ')"
              "\")"
          ], # set for macos based on silicon

        'fileset%': [
          "<!@(node -p \""
            "require('fs')"
            ".readdirSync('./src')"
            ".filter(x => x.endsWith('<(ext)'))"
            ".map(f => 'src/'+f)"
            ".join(' ')"
            "\")"
          ]
      },

      'sources' : [
        "<!@(node -p \"'<(fileset)'"
          ".split(' ')"
          ".join(' ')\")"
      ],

      'include_dirs': [
        "<!(node -e \"require('nan')\")",
        'src',
      ],

     'defines': [ 'NODE_GYP_V4' ],
      'actions': [
          {
            'action_name': 'print_variables',
            'action': ['echo', 'arch: <(arch) | link_path: <(link_path) | msodbcsql <(msodbcsql) | fileset <(fileset)'],

            'inputs': [],
            'outputs': [
              "<!@(node -p \"'<(fileset)'.split(' ')[0]\")"
              ],
            #'outputs': ['src/ConnectionHandles.cpp']
          }
      ],
      'conditions': [
            ['target < "13.0"', {
                  'defines': [
                    'PRE_V13',
                  ],
           }],
   
        [ 'OS=="win"', {
              'link_settings': {
             'libraries': [
               '<(winodbc)'
               ],
            },
          'defines': [
            'UNICODE=1',
            'WINDOWS_BUILD',
          ],
          }
        ],
        ['OS=="linux"', {
            'link_settings': {
             'libraries': [
                "<!@(node -p \"'<(link_path)'.split(' ').join(' ')\")",
               '<(linuxodbc)',
               ],
            },
            'defines': [
              'LINUX_BUILD',
              'UNICODE'
            ], 
            'cflags_cc': [
              '-std=c++1y'
            ],
            'include_dirs': [
              '/usr/include/',
              '/opt/microsoft/<(msodbcsql)/include/',
            ],
        }],
        ['OS=="mac"', {
            'link_settings': {
             'libraries': [
               '<(link_path)',
               '<(linuxodbc)'
             #'-lodbc'
               ],
            },
            'defines': [
              'LINUX_BUILD',
              'UNICODE'
            ], 
            'cflags_cc': [
              '-std=c++1y'
            ],
            'include_dirs': [
              '/usr/local/opt/<(msodbcsql)/include/',
              '/usr/local/opt/<(msodbcsql)/include/<(msodbcsql)/',
              '/opt/homebrew/include',
              '/opt/homebrew/include/<(msodbcsql)',
              '/usr/local/include/',
            ],
        }],
      ]
    }
  ]
}
