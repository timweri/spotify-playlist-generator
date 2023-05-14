const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  spotify: String,
  token: Object,
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

module.exports = User;
