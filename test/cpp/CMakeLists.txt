cmake_minimum_required(VERSION 3.14)
project(msnodesqlv8_tests CXX)

# Set C++ standard (match node-gyp)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Platform-specific settings
if(WIN32)
    # Make sure we're using MSVC
    if(NOT MSVC)
        message(FATAL_ERROR "On Windows, please use the Visual Studio generator (e.g., -G \"Visual Studio 17 2022\")")
    endif()
    
    # Add MSVC-specific flags
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} /EHsc /GF /Gm- /GS /Gy /fp:precise /Zc:wchar_t /Zc:forScope /Zc:inline /GR- /FC /std:c++20")
    set(CMAKE_CXX_FLAGS_RELEASE "${CMAKE_CXX_FLAGS_RELEASE} /Ox /Ob2 /Oi /Ot /Oy /GL /MT")
    set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
    
    # Add Windows-specific definitions
    add_definitions(
        -DWINDOWS_BUILD 
        -DUNICODE=1
        -DBUILDING_NODE_EXTENSION
        -DNOMINMAX
        -D_HAS_EXCEPTIONS=0
        -DNODE_GYP_V4
    )
    # Windows uses odbc32.lib
    set(ODBC_LIBRARIES odbc32)
else()
    # Linux/Mac settings
    add_definitions(-DLINUX_BUILD -DUNICODE)
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -std=c++20")
    # Linux/Mac use -lodbc
    find_library(ODBC_LIBRARIES NAMES odbc)
endif()

# Find Node.js headers (same ones used by node-gyp)
# Dynamically determine Node.js version
execute_process(
    COMMAND node --version
    OUTPUT_VARIABLE NODE_VERSION
    OUTPUT_STRIP_TRAILING_WHITESPACE
)
# Remove the 'v' prefix from version number
string(REGEX REPLACE "^v" "" NODE_VERSION "${NODE_VERSION}")

message(STATUS "Detected Node.js version: ${NODE_VERSION}")
set(NODE_HEADERS_DIR "$ENV{USERPROFILE}/AppData/Local/node-gyp/Cache/${NODE_VERSION}")

if(NOT EXISTS "${NODE_HEADERS_DIR}")
    message(FATAL_ERROR "Node.js headers not found at ${NODE_HEADERS_DIR}. Please ensure node-gyp has downloaded them.")
endif()

message(STATUS "Using Node.js headers from: ${NODE_HEADERS_DIR}")

# Find node-addon-api - use relative path from test/cpp to project root
set(NODE_ADDON_API_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../node_modules/node-addon-api")

# Verify the directory exists
if(NOT EXISTS "${NODE_ADDON_API_DIR}")
    message(FATAL_ERROR "node-addon-api not found at ${NODE_ADDON_API_DIR}. Make sure you have run 'npm install'.")
endif()

message(STATUS "Using node-addon-api from: ${NODE_ADDON_API_DIR}")

# Set up Node.js library paths
if(WIN32)
    set(NODE_LIBRARIES "${NODE_HEADERS_DIR}/x64/node.lib")
    if(NOT EXISTS "${NODE_LIBRARIES}")
        message(STATUS "Node.js library not found at ${NODE_LIBRARIES}, trying Release directory")
        set(NODE_LIBRARIES "${NODE_HEADERS_DIR}/Release/node.lib")
        if(NOT EXISTS "${NODE_LIBRARIES}")
            message(STATUS "Node.js library not found at ${NODE_LIBRARIES}, trying Debug directory")
            set(NODE_LIBRARIES "${NODE_HEADERS_DIR}/Debug/node.lib")
            if(NOT EXISTS "${NODE_LIBRARIES}")
                message(WARNING "Node.js library not found. Will use mock implementations instead.")
                set(NODE_LIBRARIES "")
            endif()
        endif()
    endif()
endif()

# Set up Google Test
include(FetchContent)
FetchContent_Declare(
    googletest
    GIT_REPOSITORY https://github.com/google/googletest.git
    GIT_TAG release-1.12.1
)
# For Windows, prevent overriding the parent project's compiler/linker settings
set(gtest_force_shared_crt ON CACHE BOOL "" FORCE)
FetchContent_MakeAvailable(googletest)

# Get all source files except module.cpp
file(GLOB_RECURSE SOURCE_FILES 
    "../../src/*.cpp"
)
list(FILTER SOURCE_FILES EXCLUDE REGEX ".*module\\.cpp$")

# Setup test source files
set(TEST_SOURCE_FILES
    parameter_test.cpp
    datum_storage_test.cpp
    datum_storage_test.cpp
    time_util_tests.cpp
    test_main.cpp
    # Add other test files here as needed
)

# Add required include directories
include_directories(
    "${NODE_HEADERS_DIR}/include/node"
    "${NODE_HEADERS_DIR}/src"
    "${NODE_HEADERS_DIR}/deps/openssl/config"
    "${NODE_HEADERS_DIR}/deps/openssl/openssl/include"
    "${NODE_HEADERS_DIR}/deps/uv/include"
    "${NODE_HEADERS_DIR}/deps/zlib"
    "${NODE_HEADERS_DIR}/deps/v8/include"
    "${NODE_ADDON_API_DIR}"
    "../../src"
)

# Debug output
message(STATUS "SOURCE_FILES: ${SOURCE_FILES}")
message(STATUS "TEST_SOURCE_FILES: ${TEST_SOURCE_FILES}")
message(STATUS "Current directory: ${CMAKE_CURRENT_SOURCE_DIR}")

# Add test executable
add_executable(cpp_tests ${SOURCE_FILES} ${TEST_SOURCE_FILES})

# Define compilation flags for testing
target_compile_definitions(cpp_tests PRIVATE 
    UNIT_TEST=1
    NAPI_DISABLE_CPP_EXCEPTIONS
)

# Linker flags to avoid msvcrt conflicts
if(MSVC)
    set_target_properties(cpp_tests PROPERTIES LINK_FLAGS "/NODEFAULTLIB:msvcrt.lib")
endif()

# Link with libraries
target_link_libraries(cpp_tests
    ${ODBC_LIBRARIES}
    GTest::gtest
    GTest::gtest_main
)
    
# Add Node.js library if found
if(WIN32 AND EXISTS "${NODE_LIBRARIES}")
    target_link_libraries(cpp_tests "${NODE_LIBRARIES}")
endif()

# Enable CTest
include(GoogleTest)
include(GoogleTest)
gtest_discover_tests(cpp_tests 
    DISCOVERY_MODE PRE_TEST
    PROPERTIES TIMEOUT 120
)

# add_test(NAME cpp_tests COMMAND cpp_tests)