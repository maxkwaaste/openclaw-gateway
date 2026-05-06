module.exports = {
  apps: [{
    name: 'openclaw-gateway',
    script: 'gateway.mjs',
    cwd: '/Users/maxdekwaasteniet/ClaudeCode/openclaw-gateway',
    interpreter: '/opt/homebrew/bin/node',
    max_memory_restart: '512M',
    cron_restart: '0 4 * * *',
    autorestart: true,
    watch: false,
    env: {
      NODE_ENV: 'production'
    }
  }]
};
