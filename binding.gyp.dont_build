{
  'targets': [
    {
      'target_name': 'sqlserverv8',

      'sources': [ 
        'src/Column.cpp',
        'src/Connection.cpp',
        'src/OdbcConnection.cpp',
        'src/OdbcError.cpp',
        'src/Operation.cpp',
        'src/OdbcOperation.cpp',
        'src/ResultSet.cpp',
        'src/stdafx.cpp',
        'src/Utility.cpp',
		'src/BoundDatum.cpp',
		'src/BoundDatumSet.cpp'
		],

      'include_dirs': [
        'src',
      ],

     'defines': [ '_NODE_GYP_V4'],

      'conditions': [
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


