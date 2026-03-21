import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('SUPABASE_URL y SUPABASE_SERVICE_KEY deben estar en .env')
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey)