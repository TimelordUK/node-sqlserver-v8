cmake_minimum_required(VERSION 3.14)
project(cpp_tests)

# GoogleTest requires at least C++14
set(CMAKE_CXX_STANDARD 14)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

include(FetchContent)
FetchContent_Declare(
  googletest
  URL https://github.com/google/googletest/archive/03597a01ee50ed33e9dfd640b249b4be3799d395.zip
)
# For Windows: Prevent overriding the parent project's compiler/linker settings
set(gtest_force_shared_crt ON CACHE BOOL "" FORCE)
FetchContent_MakeAvailable(googletest)

execute_process(
    COMMAND node -p "require('node-addon-api').include_dir"
    OUTPUT_VARIABLE NODE_ADDON_API_DIR
    OUTPUT_STRIP_TRAILING_WHITESPACE
)

enable_testing()

include_directories(
    ${NODE_ADDON_API_DIR}
    ${GTEST_INCLUDE_DIRS}
    ${MSODBC_INCLUDE_DIRS}
    "../../src/"
)

file(GLOB_RECURSE SOURCE_FILES 
    "../../src/*.cpp"
)

# Exclude module.cpp (the main Node.js entry point)
list(FILTER SOURCE_FILES EXCLUDE REGEX ".*module\\.cpp$")

# Get all test files
file(GLOB_RECURSE TEST_FILES 
    "*.cpp"
)

# Add test executable
add_executable(cpp_tests ${SOURCE_FILES} ${TEST_FILES})


target_link_libraries(
  cpp_tests 
  GTest::gtest_main
)

include(GoogleTest)
gtest_discover_tests(cpp_tests)