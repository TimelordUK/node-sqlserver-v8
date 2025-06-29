module.exports = {
  // WebStorm-friendly configuration
  ui: 'bdd',
  reporter: 'spec',
  require: [
    'ts-node/register',
    'source-map-support/register'
  ],
  extension: ['js', 'ts'],
  spec: ['test/**/*.js', 'test/**/*.ts'],
  timeout: 30000,
  bail: false,
  exit: true,
  recursive: true,
  
  // WebStorm specific settings
  watchFiles: ['test/**/*.js', 'src/**/*.js'],
  
  // Ensure proper error handling
  checkLeaks: true,
  asyncOnly: false,
  
  // Reporter options for better IDE integration
  reporterOptions: {
    // Show full stack traces
    fullTrace: true
  }
}