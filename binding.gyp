{
  'targets': [
    {
      'target_name': 'sqlserverv8',
      
      'variables': {
        'target%': '<!(node -e "console.log(process.versions.node)")', # Set the target variable only if it is not passed in by prebuild 
      },

      'sources': [
        'src/QueryOperationParams.cpp',
        'src/OdbcHandle.cpp',
        'src/MutateJS.cpp',
        'src/Column.cpp',
        'src/BinaryColumn.cpp',
        'src/TimestampColumn.cpp',
        'src/Connection.cpp',
        'src/OdbcConnection.cpp',
        'src/OdbcStatement.cpp',
        'src/OdbcStatementCache.cpp',
        'src/OdbcError.cpp',
        'src/OdbcConnectionBridge.cpp',
        'src/Operation.cpp',
        'src/OperationManager.cpp',
        'src/OdbcOperation.cpp',
        'src/BeginTranOperation.cpp',
        'src/CloseOperation.cpp',
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
        'src/ResultSet.cpp',
        'src/Utility.cpp',
        'src/BoundDatum.cpp',
        'src/UnbindOperation.cpp',
        'src/BoundDatumSet.cpp',
        'src/stdafx.cpp'
		  ],

      'include_dirs': [
        'src',
      ],

     'defines': [ 'NODE_GYP_V4'],

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
          ],
          }
        ]
      ]
    }
  ]
}
