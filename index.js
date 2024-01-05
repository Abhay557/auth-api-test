const express = require('express');
const app = express();
const uuid = require('uuid');
const fs = require('fs');

app.use(express.json()); // Middleware to parse JSON bodies

let apiKeys = {}; // Initialize apiKeys as an empty object
let requestCounts = {}; // Object to store request counts for each API key
const MAX_REQUESTS = 10;

const apiKeySystem = {
  loadApiKeys: function(callback) {
    fs.readFile('./api_keys.json', 'utf8', (err, data) => {
      if (err) {
        callback(err);
        return;
      }
      apiKeys = JSON.parse(data);
      callback();
    });
  },
  saveApiKeys: function(callback) {
    fs.writeFile('./api_keys.json', JSON.stringify(apiKeys), 'utf8', callback);
  },
  saveRequestCounts: function(callback) {
    fs.writeFile('./request_counts.json', JSON.stringify(requestCounts), 'utf8', callback);
  },
  generateApiKey: function(email, callback) {
    if (!this.validateEmail(email)) {
      callback(new Error('Invalid email address'));
      return;
    }
    if (apiKeys[email]) {
      callback(null, apiKeys[email]);
      return;
    }
    const apiKey = uuid.v4();
    apiKeys[email] = apiKey;
    requestCounts[apiKey] = 0; // Initialize request count for the new API key
    this.saveApiKeys(err => {
      if (err) {
        callback(err);
        return;
      }
      this.saveRequestCounts(err => {
        if (err) {
          callback(err);
          return;
        }
        callback(null, apiKey);
      });
    });
  },
  authenticateApiKey: function(apiKey) {
    return !!apiKeys[Object.keys(apiKeys).find(key => apiKeys[key] === apiKey)];
  },
  incrementRequestCount: function(apiKey) {
    if (requestCounts[apiKey] !== undefined) {
      if (requestCounts[apiKey] >= MAX_REQUESTS) {
        throw new Error('Too Many Requests');
      } else {
        requestCounts[apiKey]++;
        this.saveRequestCounts(err => {
          if (err) {
            console.error('Error saving request counts:', err);
          }
        });
      }
    }
  },
  validateEmail: function(email) {
    const emailRegex = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@/;
    return emailRegex.test(email);
  },
};

// Middleware to increment request count for valid API keys
app.use((req, res, next) => {
  const apiKey = req.query.apiKey || (req.body && req.body.api_key);
  if (apiKeySystem.authenticateApiKey(apiKey)) {
    try {
      apiKeySystem.incrementRequestCount(apiKey);
      next();
    } catch (error) {
      res.status(429).send(error.message); // 429 - Too Many Requests
    }
  } else {
    res.status(401).send('API key is invalid');
  }
});

app.use('/', (req, res) => {
  res.send('Welcome');
});

// Route to generate a new API key for an email
app.get('/generate-api-key/:email', (req, res) => {
  apiKeySystem.generateApiKey(req.params.email, (err, apiKey) => {
    if (err) {
      res.status(400).send(err.message);
      return;
    }
    res.send({ api_key: apiKey });
  });
});

// Route to access a random number (requires a valid API key)
app.get('/random-number', (req, res) => {
  const apiKey = req.query.apiKey;
  if (apiKeySystem.authenticateApiKey(apiKey)) {
    const randomNumber = Math.random();
    res.send({ randomNumber });
  } else {
    res.status(401).send('API key is invalid');
  }
});

// Route to authenticate an API key (via POST request)
app.post('/authenticate-api-key', (req, res) => {
  const apiKey = req.body.api_key;
  if (!apiKey) {
    res.status(400).send('API key is missing in request body');
    return;
  }
  const valid = apiKeySystem.authenticateApiKey(apiKey);
  if (!valid) {
    res.status(401).send('Invalid API key');
    return;
  }
  res.send({ status: 'API key valid' });
});

// Route to get the request count for a specific API key
app.get('/request-count/:apiKey', (req, res) => {
  const apiKey = req.params.apiKey;
  const count = requestCounts[apiKey] || 0;
  res.send({ api_key: apiKey, request_count: count });
});


app.use((req, res) => {
  res.status(404).send('404 - Not Found');
});

// Start the server after loading API keys
apiKeySystem.loadApiKeys(err => {
  if (err) {
    console.error(err);
    process.exit(1);
  }

  // Load request counts after loading API keys
  fs.readFile('./request_counts.json', 'utf8', (err, data) => {
    if (!err) {
      requestCounts = JSON.parse(data);
    }

    // Start the server
    app.listen(3000, () => {
      console.log('API key server listening on port 3000');
    });
  });
});


// /random-number?apiKey=34e9062a-2544-4659-baed-76092a85e779
