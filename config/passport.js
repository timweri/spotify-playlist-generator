const passport = require('passport');
const refresh = require('passport-oauth2-refresh');
const axios = require('axios');
const { Strategy: SpotifyStrategy } = require('passport-linkedin-oauth2');
const _ = require('lodash');
const moment = require('moment');

const User = require('../models/User');

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  User.findById(id, (err, user) => {
    done(err, user);
  });
});

/**
 * OAuth Strategy Overview
 *
 * - User is already logged in.
 *   - Check if there is an existing account with a provider id.
 *     - If there is, return an error message. (Account merging not supported)
 *     - Else link new OAuth account with currently logged-in user.
 * - User is not logged in.
 *   - Check if it's a returning user.
 *     - If returning user, sign in and we are done.
 *     - Else check if there is an existing account with user's email.
 *       - If there is, return an error message.
 *       - Else create a new account.
 */

/**
 * Sign in with Spotify.
 */
passport.use(new SpotifyStrategy({
  clientID: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  callbackURL: `${process.env.BASE_URL}/auth/spotify/callback`,
  scope: ['r_liteprofile', 'r_emailaddress'],
  passReqToCallback: true
}, (req, accessToken, _, _, profile, done) => {
  User.findOne({ spotify: profile.id }, (err, existingUser) => {
    if (err) { return done(err); }
    if (existingUser) {
      existingUser.token = ({ kind: 'spotify', accessToken: accessToken});
      existingUser.
      return done(null, existingUser);
    }
    User.findOne({ email: profile.emails[0].value }, (err, existingEmailUser) => {
      if (err) { return done(err); }
      if (existingEmailUser) {
        req.flash('errors', { msg: 'There is already an account using this email address. Sign in to that account and link it with LinkedIn manually from Account Settings.' });
        done(err);
      } else {
        const user = new User();
        user.linkedin = profile.id;
        user.tokens.push({ kind: 'linkedin', accessToken });
        user.email = profile.emails[0].value;
        user.profile.name = profile.displayName;
        user.profile.picture = user.profile.picture || profile.photos[3].value;
        user.save((err) => {
          done(err, user);
        });
      }
    });
  });
}));

/**
 * Tumblr API OAuth.
 */
passport.use('tumblr', new OAuthStrategy({
  requestTokenURL: 'https://www.tumblr.com/oauth/request_token',
  accessTokenURL: 'https://www.tumblr.com/oauth/access_token',
  userAuthorizationURL: 'https://www.tumblr.com/oauth/authorize',
  consumerKey: process.env.TUMBLR_KEY,
  consumerSecret: process.env.TUMBLR_SECRET,
  callbackURL: '/auth/tumblr/callback',
  passReqToCallback: true
},
(req, token, tokenSecret, profile, done) => {
  User.findById(req.user._id, (err, user) => {
    if (err) { return done(err); }
    user.tokens.push({ kind: 'tumblr', accessToken: token, tokenSecret });
    user.save((err) => {
      done(err, user);
    });
  });
}));

/**
 * Authorization Required middleware.
 */
exports.isAuthorized = (req, res, next) => {
  const provider = req.path.split('/')[2];
  const token = req.user.tokens.find((token) => token.kind === provider);
  if (token) {
    // Is there an access token expiration and access token expired?
    // Yes: Is there a refresh token?
    //     Yes: Does it have expiration and if so is it expired?
    //       Yes, Quickbooks - We got nothing, redirect to res.redirect(`/auth/${provider}`);
    //       No, Quickbooks and Google- refresh token and save, and then go to next();
    //    No:  Treat it like we got nothing, redirect to res.redirect(`/auth/${provider}`);
    // No: we are good, go to next():
    if (token.accessTokenExpires && moment(token.accessTokenExpires).isBefore(moment().subtract(1, 'minutes'))) {
      if (token.refreshToken) {
        if (token.refreshTokenExpires && moment(token.refreshTokenExpires).isBefore(moment().subtract(1, 'minutes'))) {
          res.redirect(`/auth/${provider}`);
        } else {
          refresh.requestNewAccessToken(`${provider}`, token.refreshToken, (err, accessToken, refreshToken, params) => {
            User.findById(req.user.id, (err, user) => {
              user.tokens.some((tokenObject) => {
                if (tokenObject.kind === provider) {
                  tokenObject.accessToken = accessToken;
                  if (params.expires_in) tokenObject.accessTokenExpires = moment().add(params.expires_in, 'seconds').format();
                  return true;
                }
                return false;
              });
              req.user = user;
              user.markModified('tokens');
              user.save((err) => {
                if (err) console.log(err);
                next();
              });
            });
          });
        }
      } else {
        res.redirect(`/auth/${provider}`);
      }
    } else {
      next();
    }
  } else {
    res.redirect(`/auth/${provider}`);
  }
};
