const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  spotify: String,
  name: String,
  tokens: Array,
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

module.exports = User;
