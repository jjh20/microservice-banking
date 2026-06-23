/* global use, db */
// MongoDB Playground
// Use Ctrl+Space inside a snippet or a string literal to trigger completions.

// The current database to use.
use('bankdb');

// Create a new document in the collection.
db.getCollection('accounts').insertOne({
  accountNumber: '123456',
  owner: 'Jael',
  balance: NumberInt('1000')
});
