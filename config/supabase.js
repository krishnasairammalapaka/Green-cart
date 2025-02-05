const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');
require('dotenv').config();

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase configuration!');
    process.exit(1);
}

// Validate URL format
try {
    new URL(supabaseUrl);
} catch (error) {
    console.error('Invalid Supabase URL format:', error);
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        persistSession: false
    }
});

// PostgreSQL Pool configuration
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    ssl: {
        rejectUnauthorized: false
    },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Test database connection
const testConnection = async () => {
    let client;
    try {
        client = await pool.connect();
        console.log('Successfully connected to PostgreSQL');

        // Enable the UUID extension if not exists
        await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

        // Create tables if they don't exist
        await client.query(`
            CREATE TABLE IF NOT EXISTS admins (
                id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS users (
                id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role TEXT DEFAULT 'user',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Insert default admin if not exists
        await client.query(`
            INSERT INTO admins (name, email, password)
            VALUES ('Admin User', 'admin@gmail.com', 'admin123')
            ON CONFLICT (email) DO NOTHING;
        `);

        // Insert test user if not exists
        await client.query(`
            INSERT INTO users (name, email, password, role)
            VALUES ('Test User', 'user@gmail.com', 'user123', 'user')
            ON CONFLICT (email) DO NOTHING;
        `);

        console.log('Database setup completed successfully');
    } catch (error) {
        console.error('Database setup error:', error.message);
        // Don't exit process, just log the error
        console.error('Check your database connection settings');
    } finally {
        if (client) {
            client.release();
        }
    }
};

// Run the test connection and setup
testConnection().catch(console.error);

// Error handling for the pool
pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
});

// Export the pool for use in other files
module.exports = { pool }; 