cmake_minimum_required(VERSION 3.14)
project(msnodesqlv8_tests CXX)

# Import unified configuration
execute_process(
    COMMAND node ${CMAKE_CURRENT_SOURCE_DIR}/../../build-config.js
    OUTPUT_VARIABLE CONFIG_OUTPUT
)

# Parse the output into CMake variables
string(REGEX REPLACE ";" "\\\\;" CONFIG_OUTPUT "${CONFIG_OUTPUT}")
string(REGEX REPLACE "\n" ";" CONFIG_OUTPUT "${CONFIG_OUTPUT}")
foreach(LINE ${CONFIG_OUTPUT})
    if(LINE MATCHES "^set\\(([^;]*)\\)")
        string(REGEX REPLACE "^set\\(([^;]*)\\)" "\\1" VAR_LINE "${LINE}")
        string(REGEX MATCH "^([^;]*)[ \t]*\"([^\"]*)\"" UNUSED_OUT "${VAR_LINE}")
        set(${CMAKE_MATCH_1} "${CMAKE_MATCH_2}")
    endif()
endforeach()

# Set C++ standard from unified config
set(CMAKE_CXX_STANDARD 20)  # Or use value from config
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Use platform-specific defines from config
foreach(DEFINE ${PLATFORM_DEFINES})
    add_definitions(-D${DEFINE})
endforeach()

# Platform-specific adjustments that can't be fully unified
if(WIN32)
    # Keep only Windows-specific settings that can't be unified
    if(NOT MSVC)
        message(FATAL_ERROR "On Windows, please use the Visual Studio generator")
    endif()
    
    set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
else()
    # Keep only Linux-specific settings that can't be unified
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -fexceptions")
endif()

# Use ODBC library from config
set(ODBC_LIBRARIES ${ODBC_LIB})

# The rest of your CMakeLists.txt continues as before
# ...