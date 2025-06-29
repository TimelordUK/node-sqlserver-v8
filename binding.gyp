{
    "conditions": [
        [
            'OS=="mac"',
            {
                "variables": {
                    "arch%": "<!(uname -m)",
                    "cflags_cpp": "gnu++20",
                }
            },
            'OS=="linux"',
            {
                "variables": {
                    "cflags_cpp": "-std=c++20 -fexceptions",
                    "arch%": "<!(uname -m)",
                }
            },
            'OS=="win"',
            {
                "variables": {
                    "cflags_cpp": "/std:c++20",
                    "arch%": "<!(echo %PROCESSOR_ARCHITECTURE%)",
                },
            },
        ]
    ],
    "variables": {
        "openssl_fips": "0",
        # look for include files for these versions - taking top first priority
        "msodbsver%": ["msodbcsql18", "msodbcsql17"],
        "ext%": ".cpp",
        "homebrew%": "/opt/homebrew/lib/libodbc.a",
        "unixlocalodbc%": "-l/usr/local/odbc",
        "linuxodbc%": "-lodbc",
        "winodbc%": "odbc32",
        # pick up libodbc from somwhere - note the ms driver is loaded
        # dynamicaly via odbc, no
        # link dependency is added
        "linkdir%": "/usr/local/lib /usr/local/ssl/lib64/ /opt/homebrew/lib /home/linuxbrew/.linuxbrew/lib/ /usr/lib /usr/lib64 .",
    },
    "targets": [
        {
            # seems this is only way to add the cpp version flag
            # on ms compiler - now needed for electron
            "msvs_settings": {
                "VCCLCompilerTool": {
                    "ExceptionHandling": 1,
                    "AdditionalOptions": [
                        "/std:c++20",
                        "/D_SILENCE_ALL_CXX17_DEPRECATION_WARNINGS"
                    ],
                }
            },
            "target_name": "sqlserver",
            "make_global_settings": [
                ["make_flags", "-j2"]
            ],
            "defines": [
                # "NAPI_DISABLE_CPP_EXCEPTIONS",
                # Uncomment the next line to use Node-API instead of NAN
                # "CONNECTION_USE_NODE_API",
                 "BOUNDDATUM_USE_NODE_API",
            ],
            "variables": {
                # Set the target variable only if it is not passed in by prebuild
                "target%": '<!(node -e "console.log(process.versions.node)")',
                # which folders are available for include eg.
                # /opt/microsoft/msodbcsql18/include/ /opt/microsoft/msodbcsql17/include/
                "msodbc_include_folders%": [
                    '<!@(node -p "'
                    "'<(msodbsver)'"
                    ".split(' ')"
                    ".map(x => ["
                    "'/opt/microsoft/' + x +'/include/'"
                    " ,"
                    "'/usr/local/opt/' + x + '/include/'"
                    " ,"
                    "'/usr/local/opt/' + x + '/include/' + x + '/'"
                    " ,"
                    "'/opt/homebrew/include/' + x + '/'"
                    " ,"
                    "'/home/linuxbrew/.linuxbrew/include/'"
                    "])"
                    ".flatMap(y => y)"
                    ".filter(z => require('fs').existsSync(z))"
                    ".join(' ')"
                    '")'
                ],
                # set fo
                # the link folders available -L/usr/local/lib -L/usr/lib -L.
                "link_path%": [
                    '<!@(node -p "'
                    "'<(linkdir)'"
                    ".split(' ')"
                    ".filter(x => require('fs')"
                    ".existsSync(x))"
                    ".map(x => '-L'+ x)"
                    ".join(' ')"
                    '")'
                ],  # set for macos based on silicon
                # enumerate the cpp src files rather than name them.
                "fileset%": [
                    '<!@(node -p "'
                    "['cpp/binding.cpp']"
                    ".concat("
                    "require('fs').readdirSync('./cpp/src/common').map(f => 'cpp/src/common/'+f),"
                    "require('fs').readdirSync('./cpp/src/core').map(f => 'cpp/src/core/'+f),"
                    "require('fs').readdirSync('./cpp/src/js').map(f => 'cpp/src/js/'+f),"
                    "require('fs').readdirSync('./cpp/src/js/workers').map(f => 'cpp/src/js/workers/'+f),"
                    "require('fs').readdirSync('./cpp/src/js/columns').map(f => 'cpp/src/js/columns/'+f),"
                    "require('fs').readdirSync('./cpp/src/odbc').map(f => 'cpp/src/odbc/'+f),"
                    "require('fs').readdirSync('./cpp/src/utils').map(f => 'cpp/src/utils/'+f)"
                    ")"
                    ".filter(x => x.endsWith('<(ext)'))"
                    ".join(' ')"
                    '")'
                ],
            },
            "sources": ["<!@(node -p \"'<(fileset)'" ".split(' ')" ".join(' ')\")"],
            "include_dirs": [
                "<!(node -p \"require('node-addon-api').include_dir\")",
                "cpp",
                "cpp/include",
                "cpp/include/common",
                "cpp/include/core",
                "cpp/include/js",
                "cpp/include/js/workers",
                "cpp/include/js/columns",
                "cpp/include/odbc",
                "cpp/include/utils",
            ],
            "defines": [
            "NODE_GYP_V4",

            ],
            "actions": [
                {
                    "action_name": "print_variables",
                    "conditions": [
                        ['OS=="win"', {
                            "action": [
                                "echo",
                                "compiler: MSVC | cflags_cpp <(cflags_cpp) | arch: <(arch) | link_path: <(link_path) | msodbc_include_folders <(msodbc_include_folders) | fileset <(fileset)",
                            ],
                        }, {
                            "action": [
                                "echo", 
                                "compiler: <!(echo ${CC:-gcc}) <!(echo ${CXX:-g++}) | cflags_cpp <(cflags_cpp) | arch: <(arch) | link_path: <(link_path) | msodbc_include_folders <(msodbc_include_folders) | fileset <(fileset)",
                            ],
                        }]
                    ],
                    "inputs": [],
                    "outputs": ["<!@(node -p \"'<(fileset)'.split(' ')[0]\")"],
                    #'outputs': ['src/ConnectionHandles.cpp']
                }
            ],
            #
            # currently for electron v20+ manually set the package.json
            # for node_modules/prebuild dependencies (else code will not
            # compile) - need to raise PR for prebuild
            # cat .\package.json | grep gyp
            #    "node-gyp": "^9.1.0",
            #    "nw-gyp": "^3.6.3",
            #
            # also patch nan with https://github.com/VerteDinde/nan/tree/deprecate_accessor_signature
            # whilst the PR is pending - this is only needed for electron v20 and
            # above
            #
            "conditions": [
                [
                    'target < "13.0"',
                    {
                        "defines": [
                            "PRE_V13",
                        ],
                    },
                ],
                [
                    'OS=="win"',
                    {
                        "link_settings": {
                            "libraries": ["<(winodbc)"],
                        },
                        "defines": [
                            "UNICODE=1",
                            "WINDOWS_BUILD",
                            "_SILENCE_ALL_CXX17_DEPRECATION_WARNINGS",
                            # "BOUNDDATUM_USE_NODE_API",
                                # Uncomment the next line to use Node-API instead of NAN
                            # "CONNECTION_USE_NODE_API",
                        ],
                    },
                ],
                [
                    'OS=="linux"',
                    {
                        "link_settings": {
                            "libraries": [
                                "<!@(node -p \"'<(link_path)'.split(' ').join(' ')\")",
                                "<(linuxodbc)",
                            ],
                        },
                        "defines": ["LINUX_BUILD", "UNICODE","NAPI_CPP_EXCEPTIONS"],
                        "cflags_cc": ["<(cflags_cpp)"],
                        "cflags": ["-U_FORTIFY_SOURCE", "-fno-lto"],
                        "conditions": [
                            ['<!(which gcc-10 2>/dev/null && echo 1 || echo 0)'=='1', {
                                "make_global_settings": [
                                    ["CC", "gcc-10"],
                                    ["CXX", "g++-10"]
                                ]
                            }]
                        ],
                        "include_dirs": [
                            "<!@(node -p \"'<(msodbc_include_folders)'.split(' ').join(' ')\")",
                            "/usr/include/",
                        ],
                    },
                ],
                [
                    'OS=="mac"',
                    {
                        "link_settings": {
                            "libraries": [
                                "<(link_path)",
                                "<(linuxodbc)",
                                #'-lodbc'
                            ],
                        },
                        "defines": ["LINUX_BUILD", "UNICODE", "NAPI_CPP_EXCEPTIONS"],
                        "xcode_settings": {
                            "CLANG_CXX_LANGUAGE_STANDARD": "<(cflags_cpp)",
                            "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
                            "GCC_ENABLE_CPP_RTTI": "YES",
                            "OTHER_CPLUSPLUSFLAGS": ["-fexceptions"]
                        },
                        "include_dirs": [
                            "<!@(node -p \"'<(msodbc_include_folders)'.split(' ').join(' ')\")",
                            "/opt/homebrew/include",
                            "/usr/local/include/",
                        ],
                    },
                ],
            ],
        }
    ],
}
