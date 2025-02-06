const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');
require('dotenv').config();

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials');
}

// Validate URL format
try {
    new URL(supabaseUrl);
} catch (error) {
    console.error('Invalid Supabase URL format:', error);
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// PostgreSQL Pool configuration
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
        const { data, error } = await supabase.from('users').select('count');
        if (error) throw error;
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

// Run the test connection
testConnection();

// Error handling for the pool
pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
});

module.exports = {
    supabase,
    pool
}; 