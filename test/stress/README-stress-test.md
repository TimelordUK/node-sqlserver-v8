# Stress Test Runner

A comprehensive stress testing tool for msnodesqlv8 to verify memory management and detect potential memory leaks.

## Features

- **Memory Monitoring**: Tracks RSS, heap usage, external memory, and array buffers
- **Multiple Scenarios**: Tests different column types and query patterns
- **Configurable**: Adjust iterations, reporting intervals, and GC frequency
- **Real-time Progress**: Shows operations per second and memory deltas
- **Error Tracking**: Captures and reports errors during execution

## Usage

```bash
# Basic usage (requires CONNECTION_STRING environment variable)
node --expose-gc stress-test-runner.js <scenario>

# With connection string
node --expose-gc stress-test-runner.js <scenario> --connection "Server=localhost;Database=test;..."

# With custom iterations
node --expose-gc stress-test-runner.js string-select --iterations 50000

# Full example
node --expose-gc stress-test-runner.js binary-select \
  --iterations 100000 \
  --report 5000 \
  --gc 10000 \
  --connection "Server=localhost;Database=test;Trusted_Connection=Yes;"
```

## Available Scenarios

1. **string-select**: Repeatedly select NVARCHAR columns
2. **binary-select**: Repeatedly select VARBINARY columns
3. **mixed-select**: Select all column types together
4. **large-text**: Select TEXT and IMAGE columns (deprecated types)
5. **parameter-binding**: Test parameterized queries
6. **streaming**: Stream results row by row
7. **rapid-queries**: Execute many small queries quickly

## Options

- `--iterations <number>`: Number of test iterations (default: 10000)
- `--report <number>`: Progress report interval (default: 1000)
- `--gc <number>`: Force garbage collection interval (default: 5000)
- `--connection <string>`: SQL Server connection string

## Memory Leak Detection

The tool monitors memory usage throughout the test:

1. **Baseline**: Initial memory snapshot after GC
2. **Progress Reports**: Memory usage at regular intervals
3. **Final Report**: Memory usage after test completion

Look for continuously increasing heap usage or RSS that doesn't stabilize - this indicates a potential memory leak.

## Important Notes

1. **Always use --expose-gc flag** for accurate memory tracking
2. The tool creates and drops a test table (`stress_test_table`)
3. Each scenario is designed to stress a specific aspect of the driver
4. The tool forces garbage collection periodically to get accurate memory readings

## Example Output

```
Running scenario: Binary Column Selection
Description: Repeatedly select binary columns to check for memory leaks
Iterations: 50000
----------------------------------------
[Memory] Baseline
  RSS: 125.45 MB
  Heap Total: 45.23 MB
  Heap Used: 22.14 MB
  External: 2.34 MB
  Array Buffers: 0.05 MB

Progress: 5000/50000 iterations (1250.3 ops/sec)
[Memory] After 5000 iterations
  RSS: 142.67 MB
  Heap Total: 48.90 MB
  Heap Used: 25.78 MB
  External: 12.45 MB
  Array Buffers: 10.23 MB
  Heap Delta: +3.64 MB
  RSS Delta: +17.22 MB

...

----------------------------------------
Scenario completed: Binary Column Selection
Total iterations: 50000
Total time: 42.35 seconds
Average rate: 1180.7 operations/second
Errors: 0

[Memory] Final
  RSS: 145.23 MB
  Heap Total: 49.12 MB
  Heap Used: 24.56 MB
  External: 2.45 MB
  Array Buffers: 0.08 MB
  Heap Delta: +2.42 MB
  RSS Delta: +19.78 MB
```

## Interpreting Results

- **Stable Memory**: Heap delta should stabilize after initial growth
- **Memory Leak**: Continuously increasing heap/RSS without stabilization
- **External Memory**: Spikes during binary operations are normal if released after GC
- **Array Buffers**: Should return to baseline after GC for binary data