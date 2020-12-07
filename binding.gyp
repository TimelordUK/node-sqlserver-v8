{
  'targets': [
    {
      'target_name': 'sqlserverv8',

      'variables': {
        'target%': '<!(node -e "console.log(process.versions.node)")', # Set the target variable only if it is not passed in by prebuild 
      },

      'sources': [
        'src/ConnectionHandles.cpp',
        'src/addon.cpp',
        'src/QueryOperationParams.cpp',
        'src/MutateJS.cpp',
        'src/BoundDatum.cpp',
        'src/BoundDatumSet.cpp',
        'src/ResultSet.cpp',
        'src/Column.cpp',
        'src/BinaryColumn.cpp',
        'src/TimestampColumn.cpp',
        'src/OdbcConnection.cpp',
        'src/CollectOperation.cpp',
        'src/EndTranOperation.cpp',
        'src/CancelOperation.cpp',
        'src/OpenOperation.cpp',
        'src/PrepareOperation.cpp',
        'src/PollingModeOperation.cpp',
        'src/ProcedureOperation.cpp',
        'src/QueryOperation.cpp',
        'src/ReadColumnOperation.cpp',
        'src/QueryPreparedOperation.cpp',
        'src/FreeStatementOperation.cpp',
        'src/ReadNextResultOperation.cpp',
        'src/OdbcStatement.cpp',
        'src/BeginTranOperation.cpp',
        'src/CloseOperation.cpp',
        'src/OdbcOperation.cpp',
        'src/OdbcHandle.cpp',        
        'src/UnbindOperation.cpp',
        'src/OdbcStatementCache.cpp',
        'src/OdbcError.cpp',
        'src/OdbcConnectionBridge.cpp',
        'src/Operation.cpp',
        'src/OperationManager.cpp',
        'src/Utility.cpp', 
        'src/Connection.cpp',
        'src/stdafx.cpp'
		  ],

      'include_dirs': [
        "<!(node -e \"require('nan')\")",
        'src',
      ],

     'defines': [ 'NODE_GYP_V4' ],

      'conditions': [
         ['target < "13.0"', {
                  'defines': [
                    'PRE_V13',
                  ],
           }
        ],
        [ 'OS=="win"', {
          'defines': [
            'UNICODE=1',
            '_UNICODE=1',
            '_SQLNCLI_ODBC_',
            'WINDOWS_BUILD',
          ],
          }
        ],
        ['OS=="linux"', {
            'link_settings': {
             'libraries': ['-L/usr/lib', '-lmsodbcsql-17'],
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
              '/opt/microsoft/msodbcsql17/include/',
            ],
        }],
        ['OS=="mac"', {
            'link_settings': {
             'libraries': ['-L/usr/local/lib', '-lmsodbcsql.17'],
            },
            'defines': [
              'LINUX_BUILD',
              'UNICODE'
            ], 
            'cflags_cc': [
              '-std=c++1y'
            ],
            'include_dirs': [
              '/usr/local/include/',
              '/usr/local/opt/msodbcsql17/include/',
            ],
        }],
      ]
    }
  ]
}
