# Pool Efficient Strategy

## Overview

The `efficient` scaling strategy provides optimized pool growth behavior that only creates new connections when existing idle connections are exhausted. This addresses the inefficiency in the default `aggressive` strategy where the pool grows to the ceiling immediately on open.

## Problem Solved

The original pool behavior had these inefficiencies:

1. **Eager growth**: With `aggressive` strategy, pools grew to ceiling immediately on open
2. **Unnecessary connections**: Created connections even when idle ones were available
3. **Resource waste**: Maintained more connections than needed for typical workloads

## Solution: Efficient Strategy

### Behavior

- **Initial creation**: Creates connections only up to `floor` on pool open
- **Conservative growth**: Only grows when work queue exceeds idle connections
- **Incremental scaling**: Adds connections based on actual demand

### Usage

```javascript
const pool = new sql.Pool({
  connectionString: '...',
  floor: 5,           // Start with 5 connections
  ceiling: 20,        // Maximum 20 connections  
  scalingStrategy: 'efficient',    // Use efficient strategy
  scalingIncrement: 3              // Grow by 3 when needed
})
```

### Comparison of Strategies

| Strategy | Initial Growth | Additional Growth | Use Case |
|----------|----------------|------------------|----------|
| `aggressive` | To ceiling immediately | None needed | High constant load |
| `gradual` | To ceiling incrementally | Fixed increments | Predictable growth |
| `exponential` | To floor, then exponential | By growth factor | Adaptive scaling |
| `efficient` | To floor only | Only when needed | Variable/bursty load |

## Examples

### Scenario 1: Burst Workload
```javascript
// With efficient strategy
const pool = new sql.Pool({
  floor: 5,
  ceiling: 20,
  scalingStrategy: 'efficient'
})

// 1. Pool starts with 5 connections
// 2. Submit 5 queries → uses existing connections, no growth
// 3. Submit 10 queries → grows only when idle connections exhausted
// 4. Later: idle connections reused for new work
```

### Scenario 2: Variable Load
```javascript
// Perfect for applications with:
// - Variable query load
// - Periods of low activity  
// - Need to minimize connection overhead
// - Want to reuse existing connections efficiently
```

## Benefits

1. **Resource efficiency**: Uses fewer connections for typical workloads
2. **Better connection reuse**: Maximizes use of existing idle connections
3. **Reduced overhead**: Lower memory and connection overhead
4. **Backward compatible**: Other strategies remain unchanged

## Migration

Existing code continues to work unchanged. To opt into efficient behavior:

```javascript
// Old (aggressive by default)
const pool = new sql.Pool({ connectionString, ceiling: 20 })

// New (efficient)  
const pool = new sql.Pool({ 
  connectionString, 
  floor: 5,
  ceiling: 20, 
  scalingStrategy: 'efficient' 
})
```

## Testing

The efficient strategy is thoroughly tested to ensure:
- Only grows when idle connections are exhausted
- Respects floor and ceiling limits
- Maintains backward compatibility
- Handles burst workloads correctly

See `test/pool-efficient-strategy.test.js` for comprehensive test coverage.