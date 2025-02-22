const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');
require('dotenv').config();

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

<<<<<<< HEAD
// Create Supabase client
const supabase = createClient(supabaseUrl, supabaseKey);
=======
if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase credentials. Please check your .env file');
}

// Validate URL format
try {
    new URL(supabaseUrl);
} catch (error) {
    console.error('Invalid Supabase URL format:', error);
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);
>>>>>>> deba7f6 (added the gemni API key for the catbot)

// Direct PostgreSQL connection
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Test database connection
<<<<<<< HEAD
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('Database connection error:', err);
    } else {
        console.log('Database connected successfully');
=======
const testConnection = async () => {
    try {
        // Test Supabase connection
        const { data: usersData, error: usersError } = await supabase.from('users').select('count');
        if (usersError) throw usersError;
        console.log('Successfully connected to Supabase');

        // Test admins table connection
        const { data: adminData, error: adminError } = await supabase.from('admins').select('count');
        if (adminError) {
            console.error('Admins table error:', adminError.message);
        } else {
            console.log('Successfully connected to admins table');
        }

        // Test PostgreSQL connection
        const client = await pool.connect();
        try {
            await client.query('SELECT NOW()');
            console.log('Successfully connected to PostgreSQL');
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Database connection error:', error.message);
>>>>>>> deba7f6 (added the gemni API key for the catbot)
    }
});

module.exports = {
    supabase,
    pool
}; 