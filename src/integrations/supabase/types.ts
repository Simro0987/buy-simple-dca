export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          arb_addresses: Json
          arbiscan_api_key: string | null
          btc_address: string | null
          created_at: string
          dca_day: string
          dca_frequency: string
          dca_horizon_weeks: number
          default_amount: number
          eth_address: string | null
          eth_arb_address: string | null
          etherscan_api_key: string | null
          helius_api_key: string | null
          holdings_strategy: Json
          id: string
          jitosol_contract: string
          manual_holdings: Json
          pin_hash: string | null
          rebalance_threshold: number
          regime_multipliers: Json
          score_base_allocations: Json
          sol_address: string | null
          sol_arb_address: string | null
          staking_config: Json
          telegram_chat_id: string | null
          telegram_token: string | null
          theme: string
          total_capital: number
          updated_at: string
          wsteth_contract: string
          yield_apys: Json
        }
        Insert: {
          arb_addresses?: Json
          arbiscan_api_key?: string | null
          btc_address?: string | null
          created_at?: string
          dca_day?: string
          dca_frequency?: string
          dca_horizon_weeks?: number
          default_amount?: number
          eth_address?: string | null
          eth_arb_address?: string | null
          etherscan_api_key?: string | null
          helius_api_key?: string | null
          holdings_strategy?: Json
          id?: string
          jitosol_contract?: string
          manual_holdings?: Json
          pin_hash?: string | null
          rebalance_threshold?: number
          regime_multipliers?: Json
          score_base_allocations?: Json
          sol_address?: string | null
          sol_arb_address?: string | null
          staking_config?: Json
          telegram_chat_id?: string | null
          telegram_token?: string | null
          theme?: string
          total_capital?: number
          updated_at?: string
          wsteth_contract?: string
          yield_apys?: Json
        }
        Update: {
          arb_addresses?: Json
          arbiscan_api_key?: string | null
          btc_address?: string | null
          created_at?: string
          dca_day?: string
          dca_frequency?: string
          dca_horizon_weeks?: number
          default_amount?: number
          eth_address?: string | null
          eth_arb_address?: string | null
          etherscan_api_key?: string | null
          helius_api_key?: string | null
          holdings_strategy?: Json
          id?: string
          jitosol_contract?: string
          manual_holdings?: Json
          pin_hash?: string | null
          rebalance_threshold?: number
          regime_multipliers?: Json
          score_base_allocations?: Json
          sol_address?: string | null
          sol_arb_address?: string | null
          staking_config?: Json
          telegram_chat_id?: string | null
          telegram_token?: string | null
          theme?: string
          total_capital?: number
          updated_at?: string
          wsteth_contract?: string
          yield_apys?: Json
        }
        Relationships: []
      }
      capital_entries: {
        Row: {
          amount: number
          created_at: string
          id: string
          note: string | null
          type: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          note?: string | null
          type?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          note?: string | null
          type?: string
        }
        Relationships: []
      }
      dca_purchases: {
        Row: {
          allocation_pct: number | null
          btc_amount: number
          btc_price: number
          created_at: string
          eth_amount: number
          eth_price: number
          id: string
          limit_amount: number
          market_amount: number
          notes: string | null
          regime: string | null
          score: number | null
          sol_amount: number
          sol_price: number
          total_amount: number
          week_number: number
        }
        Insert: {
          allocation_pct?: number | null
          btc_amount?: number
          btc_price?: number
          created_at?: string
          eth_amount?: number
          eth_price?: number
          id?: string
          limit_amount?: number
          market_amount?: number
          notes?: string | null
          regime?: string | null
          score?: number | null
          sol_amount?: number
          sol_price?: number
          total_amount?: number
          week_number: number
        }
        Update: {
          allocation_pct?: number | null
          btc_amount?: number
          btc_price?: number
          created_at?: string
          eth_amount?: number
          eth_price?: number
          id?: string
          limit_amount?: number
          market_amount?: number
          notes?: string | null
          regime?: string | null
          score?: number | null
          sol_amount?: number
          sol_price?: number
          total_amount?: number
          week_number?: number
        }
        Relationships: []
      }
      limit_orders: {
        Row: {
          amount_usd: number
          cancelled_at: string | null
          coin: string
          created_at: string
          filled_at: string | null
          id: string
          limit_price: number
          status: string
          week_number: number
        }
        Insert: {
          amount_usd: number
          cancelled_at?: string | null
          coin: string
          created_at?: string
          filled_at?: string | null
          id?: string
          limit_price: number
          status?: string
          week_number: number
        }
        Update: {
          amount_usd?: number
          cancelled_at?: string | null
          coin?: string
          created_at?: string
          filled_at?: string | null
          id?: string
          limit_price?: number
          status?: string
          week_number?: number
        }
        Relationships: []
      }
      staking_rewards: {
        Row: {
          btc_reward: number
          created_at: string
          eth_reward: number
          id: string
          month: string
          sol_reward: number
          total_usd: number
        }
        Insert: {
          btc_reward?: number
          created_at?: string
          eth_reward?: number
          id?: string
          month: string
          sol_reward?: number
          total_usd?: number
        }
        Update: {
          btc_reward?: number
          created_at?: string
          eth_reward?: number
          id?: string
          month?: string
          sol_reward?: number
          total_usd?: number
        }
        Relationships: []
      }
      telegram_bot_state: {
        Row: {
          id: number
          update_offset: number
          updated_at: string
        }
        Insert: {
          id: number
          update_offset?: number
          updated_at?: string
        }
        Update: {
          id?: number
          update_offset?: number
          updated_at?: string
        }
        Relationships: []
      }
      telegram_callback_log: {
        Row: {
          action_type: string
          callback_data: string
          chat_id: number
          created_at: string
          id: string
          message_id: number | null
          profit_pct: number | null
          status: string
          token: string | null
        }
        Insert: {
          action_type: string
          callback_data: string
          chat_id: number
          created_at?: string
          id?: string
          message_id?: number | null
          profit_pct?: number | null
          status?: string
          token?: string | null
        }
        Update: {
          action_type?: string
          callback_data?: string
          chat_id?: number
          created_at?: string
          id?: string
          message_id?: number | null
          profit_pct?: number | null
          status?: string
          token?: string | null
        }
        Relationships: []
      }
      telegram_config: {
        Row: {
          chat_id: string
          dca_reminder_enabled: boolean
          id: number
          limit_alert_enabled: boolean
          news_alert_enabled: boolean
          updated_at: string
          weekly_budget: number
        }
        Insert: {
          chat_id?: string
          dca_reminder_enabled?: boolean
          id: number
          limit_alert_enabled?: boolean
          news_alert_enabled?: boolean
          updated_at?: string
          weekly_budget?: number
        }
        Update: {
          chat_id?: string
          dca_reminder_enabled?: boolean
          id?: number
          limit_alert_enabled?: boolean
          news_alert_enabled?: boolean
          updated_at?: string
          weekly_budget?: number
        }
        Relationships: []
      }
      weekly_scores: {
        Row: {
          base_allocation: number | null
          cash_reserve: number | null
          created_at: string
          final_allocation: number | null
          flush_score: number | null
          id: string
          invested_amount: number | null
          onchain_score: number | null
          regime: string
          regime_multiplier: number | null
          risk_score: number | null
          score: number
          sentiment_score: number | null
          trend_score: number | null
          week_number: number
          weekly_capital: number | null
        }
        Insert: {
          base_allocation?: number | null
          cash_reserve?: number | null
          created_at?: string
          final_allocation?: number | null
          flush_score?: number | null
          id?: string
          invested_amount?: number | null
          onchain_score?: number | null
          regime: string
          regime_multiplier?: number | null
          risk_score?: number | null
          score: number
          sentiment_score?: number | null
          trend_score?: number | null
          week_number: number
          weekly_capital?: number | null
        }
        Update: {
          base_allocation?: number | null
          cash_reserve?: number | null
          created_at?: string
          final_allocation?: number | null
          flush_score?: number | null
          id?: string
          invested_amount?: number | null
          onchain_score?: number | null
          regime?: string
          regime_multiplier?: number | null
          risk_score?: number | null
          score?: number
          sentiment_score?: number | null
          trend_score?: number | null
          week_number?: number
          weekly_capital?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_cron_jobs_status: {
        Args: never
        Returns: {
          active: boolean
          jobid: number
          jobname: string
          last_run_message: string
          last_run_started: string
          last_run_status: string
          schedule: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
