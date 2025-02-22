const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');
require('dotenv').config();

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase URL or Anonymous Key');
}

// Validate URL format
try {
    new URL(supabaseUrl);
} catch (error) {
    console.error('Invalid Supabase URL format:', error);
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Direct PostgreSQL connection
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Test database connection
const testConnection = async () => {
    try {
        // Test Supabase connection
        const { data: usersData, error: usersError } = await supabase.from('users').select('count');
        if (usersError) throw usersError;
        console.log('Successfully connected to Supabase');

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
    }
};

testConnection();

module.exports = {
    supabase,
    pool
}; 