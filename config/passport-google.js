const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

passport.use(new GoogleStrategy({
    clientID: '321889002994-hrjdo00j4qfcvhaljifg23aj7mamelqe.apps.googleusercontent.com',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: 'http://localhost:3000/auth/google/callback',
    passReqToCallback: true,
    userProfileURL: 'https://www.googleapis.com/oauth2/v3/userinfo'
  },
  async function(request, accessToken, refreshToken, profile, done) {
    try {
      console.log('Google profile:', profile);

      // Check if user exists in database
      const { data: existingUser, error: fetchError } = await supabase
        .from('users')
        .select('*')
        .eq('email', profile.emails[0].value)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        console.error('Fetch error:', fetchError);
        return done(fetchError, null);
      }

      if (existingUser) {
        // Update existing user with Google info if needed
        const { data: updatedUser, error: updateError } = await supabase
          .from('users')
          .update({
            google_id: profile.id,
            avatar_url: profile.photos[0].value,
            last_login: new Date(),
            name: profile.displayName,
            full_name: profile.displayName,
            is_verified: true,
            auth_provider: 'google'
          })
          .eq('id', existingUser.id)
          .select()
          .single();

        if (updateError) {
          console.error('Update error:', updateError);
          return done(updateError, null);
        }

        return done(null, updatedUser);
      }

      // If user doesn't exist, create new user
      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert([
          {
            email: profile.emails[0].value,
            google_id: profile.id,
            name: profile.displayName,
            full_name: profile.displayName,
            avatar_url: profile.photos[0].value,
            role: 'user',
            is_verified: true,
            auth_provider: 'google',
            created_at: new Date(),
            last_login: new Date()
          }
        ])
        .select()
        .single();

      if (insertError) {
        console.error('Insert error:', insertError);
        return done(insertError, null);
      }

      return done(null, newUser);
    } catch (error) {
      console.error('Strategy error:', error);
      return done(error, null);
    }
  }
));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      return done(error, null);
    }
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

module.exports = passport; 