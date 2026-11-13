// Gerado com `supabase gen types` (via MCP do Supabase) a partir do banco real.
// Para regenerar: `npm run db:types` (precisa de `supabase login` + `supabase link`).
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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          pluggy_name: string | null
          days_source: string | null
          available_limit_cents: number | null
          balance_cents: number | null
          bill_close_date: string | null
          bill_due_date: string | null
          credit_limit_cents: number | null
          pluggy_item_id: string | null
          synced_at: string | null
          closing_day: number | null
          created_at: string
          due_day: number | null
          id: string
          kind: Database["public"]["Enums"]["account_kind"]
          name: string
          pluggy_account_id: string | null
          user_id: string
        }
        Insert: {
          pluggy_name?: string | null
          days_source?: string | null
          available_limit_cents?: number | null
          balance_cents?: number | null
          bill_close_date?: string | null
          bill_due_date?: string | null
          credit_limit_cents?: number | null
          pluggy_item_id?: string | null
          synced_at?: string | null
          closing_day?: number | null
          created_at?: string
          due_day?: number | null
          id?: string
          kind: Database["public"]["Enums"]["account_kind"]
          name: string
          pluggy_account_id?: string | null
          user_id?: string
        }
        Update: {
          pluggy_name?: string | null
          days_source?: string | null
          available_limit_cents?: number | null
          balance_cents?: number | null
          bill_close_date?: string | null
          bill_due_date?: string | null
          credit_limit_cents?: number | null
          pluggy_item_id?: string | null
          synced_at?: string | null
          closing_day?: number | null
          created_at?: string
          due_day?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["account_kind"]
          name?: string
          pluggy_account_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      api_tokens: {
        Row: {
          created_at: string
          id: string
          last_used_at: string | null
          name: string
          prefix: string
          revoked_at: string | null
          scopes: string[]
          token_hash: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          name: string
          prefix: string
          revoked_at?: string | null
          scopes?: string[]
          token_hash: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          name?: string
          prefix?: string
          revoked_at?: string | null
          scopes?: string[]
          token_hash?: string
          user_id?: string
        }
        Relationships: []
      }
      budget_periods: {
        Row: {
          cap_cents: number
          created_at: string
          end_date: string
          id: string
          month: string
          name: string
          start_date: string
          user_id: string
        }
        Insert: {
          cap_cents: number
          created_at?: string
          end_date: string
          id?: string
          month: string
          name: string
          start_date: string
          user_id?: string
        }
        Update: {
          cap_cents?: number
          created_at?: string
          end_date?: string
          id?: string
          month?: string
          name?: string
          start_date?: string
          user_id?: string
        }
        Relationships: []
      }
      oauth_codes: {
        Row: {
          client_id: string
          client_name: string
          code_challenge: string
          code_hash: string
          created_at: string
          expires_at: string
          redirect_uri: string
          resource: string
          scopes: string[]
          used_at: string | null
          user_id: string
        }
        Insert: {
          client_id: string
          client_name: string
          code_challenge: string
          code_hash: string
          created_at?: string
          expires_at: string
          redirect_uri: string
          resource: string
          scopes: string[]
          used_at?: string | null
          user_id?: string
        }
        Update: {
          client_id?: string
          client_name?: string
          code_challenge?: string
          code_hash?: string
          created_at?: string
          expires_at?: string
          redirect_uri?: string
          resource?: string
          scopes?: string[]
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      oauth_grants: {
        Row: {
          client_hash: string
          client_name: string
          created_at: string
          id: string
          last_used_at: string | null
          redirect_host: string
          resource: string
          revoked_at: string | null
          scopes: string[]
          user_id: string
        }
        Insert: {
          client_hash: string
          client_name: string
          created_at?: string
          id?: string
          last_used_at?: string | null
          redirect_host: string
          resource: string
          revoked_at?: string | null
          scopes: string[]
          user_id?: string
        }
        Update: {
          client_hash?: string
          client_name?: string
          created_at?: string
          id?: string
          last_used_at?: string | null
          redirect_host?: string
          resource?: string
          revoked_at?: string | null
          scopes?: string[]
          user_id?: string
        }
        Relationships: []
      }
      oauth_tokens: {
        Row: {
          created_at: string
          expires_at: string
          grant_id: string
          kind: string
          token_hash: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          grant_id: string
          kind: string
          token_hash: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          grant_id?: string
          kind?: string
          token_hash?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      bill_payments: {
        Row: {
          transaction_id: string | null
          auto_reason: string | null
          dismissed: boolean
          id: string
          key: string
          month: string
          paid_at: string
          user_id: string
        }
        Insert: {
          transaction_id?: string | null
          auto_reason?: string | null
          dismissed?: boolean
          id?: string
          key: string
          month: string
          paid_at?: string
          user_id?: string
        }
        Update: {
          transaction_id?: string | null
          auto_reason?: string | null
          dismissed?: boolean
          id?: string
          key?: string
          month?: string
          paid_at?: string
          user_id?: string
        }
        Relationships: []
      }
      budget_allocations: {
        Row: {
          amount_cents: number
          bucket: Database["public"]["Enums"]["bucket"]
          budget_id: string
          id: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          bucket: Database["public"]["Enums"]["bucket"]
          budget_id: string
          id?: string
          user_id?: string
        }
        Update: {
          amount_cents?: number
          bucket?: Database["public"]["Enums"]["bucket"]
          budget_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_allocations_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "monthly_budgets"
            referencedColumns: ["id"]
          },
        ]
      }
      card_bills: {
        Row: {
          status: string | null
          paid_cents: number | null
          paid_on: string | null
          payment_tx_id: string | null
          account_id: string
          closing_date: string | null
          due_date: string
          id: string
          minimum_cents: number | null
          pluggy_bill_id: string
          synced_at: string
          total_cents: number
          user_id: string
        }
        Insert: {
          status?: string | null
          paid_cents?: number | null
          paid_on?: string | null
          payment_tx_id?: string | null
          account_id: string
          closing_date?: string | null
          due_date: string
          id?: string
          minimum_cents?: number | null
          pluggy_bill_id: string
          synced_at?: string
          total_cents: number
          user_id?: string
        }
        Update: {
          status?: string | null
          paid_cents?: number | null
          paid_on?: string | null
          payment_tx_id?: string | null
          account_id?: string
          closing_date?: string | null
          due_date?: string
          id?: string
          minimum_cents?: number | null
          pluggy_bill_id?: string
          synced_at?: string
          total_cents?: number
          user_id?: string
        }
        Relationships: []
      }
      categorization_rules: {
        Row: {
          subtype: string | null
          origin: string
          bucket: Database["public"]["Enums"]["bucket"]
          created_at: string
          id: string
          pattern: string
          user_id: string
        }
        Insert: {
          subtype?: string | null
          origin?: string
          bucket: Database["public"]["Enums"]["bucket"]
          created_at?: string
          id?: string
          pattern: string
          user_id?: string
        }
        Update: {
          subtype?: string | null
          origin?: string
          bucket?: Database["public"]["Enums"]["bucket"]
          created_at?: string
          id?: string
          pattern?: string
          user_id?: string
        }
        Relationships: []
      }
      fixed_expenses: {
        Row: {
          match_pattern: string | null
          source: string
          account_id: string | null
          amount_cents: number
          category: Database["public"]["Enums"]["fixed_category"]
          created_at: string
          id: string
          month: string
          name: string
          user_id: string
        }
        Insert: {
          match_pattern?: string | null
          source?: string
          account_id?: string | null
          amount_cents: number
          category: Database["public"]["Enums"]["fixed_category"]
          created_at?: string
          id?: string
          month: string
          name: string
          user_id?: string
        }
        Update: {
          match_pattern?: string | null
          source?: string
          account_id?: string | null
          amount_cents?: number
          category?: Database["public"]["Enums"]["fixed_category"]
          created_at?: string
          id?: string
          month?: string
          name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fixed_expenses_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      incomes: {
        Row: {
          source: string
          transaction_id: string | null
          status: string
          amount_cents: number
          created_at: string
          description: string
          id: string
          kind: Database["public"]["Enums"]["income_kind"]
          month: string
          user_id: string
        }
        Insert: {
          source?: string
          transaction_id?: string | null
          status?: string
          amount_cents: number
          created_at?: string
          description: string
          id?: string
          kind?: Database["public"]["Enums"]["income_kind"]
          month: string
          user_id?: string
        }
        Update: {
          source?: string
          transaction_id?: string | null
          status?: string
          amount_cents?: number
          created_at?: string
          description?: string
          id?: string
          kind?: Database["public"]["Enums"]["income_kind"]
          month?: string
          user_id?: string
        }
        Relationships: []
      }
      installment_purchases: {
        Row: {
          purchase_date: string | null
          covered_by_bank: boolean
          matched_tx_id: string | null
          account_id: string | null
          created_at: string
          first_invoice_month: string
          id: string
          installment_cents: number
          installments_count: number
          name: string
          notes: string | null
          status: Database["public"]["Enums"]["installment_status"]
          total_cents: number
          user_id: string
        }
        Insert: {
          purchase_date?: string | null
          covered_by_bank?: boolean
          matched_tx_id?: string | null
          account_id?: string | null
          created_at?: string
          first_invoice_month: string
          id?: string
          installment_cents: number
          installments_count: number
          name: string
          notes?: string | null
          status?: Database["public"]["Enums"]["installment_status"]
          total_cents: number
          user_id?: string
        }
        Update: {
          purchase_date?: string | null
          covered_by_bank?: boolean
          matched_tx_id?: string | null
          account_id?: string | null
          created_at?: string
          first_invoice_month?: string
          id?: string
          installment_cents?: number
          installments_count?: number
          name?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["installment_status"]
          total_cents?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "installment_purchases_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_budgets: {
        Row: {
          control_start: string | null
          cap_cents: number
          created_at: string
          id: string
          method: Database["public"]["Enums"]["budget_method"]
          month: string
          skipped_weekends: string[]
          user_id: string
        }
        Insert: {
          control_start?: string | null
          cap_cents: number
          created_at?: string
          id?: string
          method: Database["public"]["Enums"]["budget_method"]
          month: string
          skipped_weekends?: string[]
          user_id?: string
        }
        Update: {
          control_start?: string | null
          cap_cents?: number
          created_at?: string
          id?: string
          method?: Database["public"]["Enums"]["budget_method"]
          month?: string
          skipped_weekends?: string[]
          user_id?: string
        }
        Relationships: []
      }
      pluggy_items: {
        Row: {
          connector_name: string | null
          consent_expires_at: string | null
          created_at: string
          id: string
          item_id: string
          last_sync_summary: Json | null
          last_synced_at: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          connector_name?: string | null
          consent_expires_at?: string | null
          created_at?: string
          id?: string
          item_id: string
          last_sync_summary?: Json | null
          last_synced_at?: string | null
          status?: string | null
          user_id?: string
        }
        Update: {
          connector_name?: string | null
          consent_expires_at?: string | null
          created_at?: string
          id?: string
          item_id?: string
          last_sync_summary?: Json | null
          last_synced_at?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          label_lazer: string
          label_mercado: string
          self_names: string[]
          self_tax_ids: string[]
          opening_balance_cents: number
          projection_start: string
          updated_at: string
          user_id: string
        }
        Insert: {
          label_lazer?: string
          label_mercado?: string
          self_names?: string[]
          self_tax_ids?: string[]
          opening_balance_cents?: number
          projection_start: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          label_lazer?: string
          label_mercado?: string
          self_names?: string[]
          self_tax_ids?: string[]
          opening_balance_cents?: number
          projection_start?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          auto_reason: string | null
          prev_bucket: Database["public"]["Enums"]["bucket"] | null
          user_locked: boolean
          linked_tx_id: string | null
          fee_cents: number | null
          invoice_month: string | null
          manual_id: string | null
          superseded: boolean
          subtype: string | null
          is_inflow: boolean
          installment_number: number | null
          pluggy_bill_id: string | null
          pluggy_category: string | null
          pluggy_status: string | null
          synced_at: string | null
          total_installments: number | null
          account_id: string | null
          amount_cents: number
          bucket: Database["public"]["Enums"]["bucket"]
          created_at: string
          description: string
          external_id: string | null
          idempotency_key: string | null
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          occurred_on: string
          source: Database["public"]["Enums"]["tx_source"]
          user_id: string
        }
        Insert: {
          auto_reason?: string | null
          prev_bucket?: Database["public"]["Enums"]["bucket"] | null
          user_locked?: boolean
          linked_tx_id?: string | null
          fee_cents?: number | null
          invoice_month?: string | null
          manual_id?: string | null
          superseded?: boolean
          subtype?: string | null
          is_inflow?: boolean
          installment_number?: number | null
          pluggy_bill_id?: string | null
          pluggy_category?: string | null
          pluggy_status?: string | null
          synced_at?: string | null
          total_installments?: number | null
          account_id?: string | null
          amount_cents: number
          bucket?: Database["public"]["Enums"]["bucket"]
          created_at?: string
          description: string
          external_id?: string | null
          idempotency_key?: string | null
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          occurred_on: string
          source?: Database["public"]["Enums"]["tx_source"]
          user_id?: string
        }
        Update: {
          auto_reason?: string | null
          prev_bucket?: Database["public"]["Enums"]["bucket"] | null
          user_locked?: boolean
          linked_tx_id?: string | null
          fee_cents?: number | null
          invoice_month?: string | null
          manual_id?: string | null
          superseded?: boolean
          subtype?: string | null
          is_inflow?: boolean
          installment_number?: number | null
          pluggy_bill_id?: string | null
          pluggy_category?: string | null
          pluggy_status?: string | null
          synced_at?: string | null
          total_installments?: number | null
          account_id?: string | null
          amount_cents?: number
          bucket?: Database["public"]["Enums"]["bucket"]
          created_at?: string
          description?: string
          external_id?: string | null
          idempotency_key?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          occurred_on?: string
          source?: Database["public"]["Enums"]["tx_source"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      hit_rate_limit: {
        Args: { p_user: string; p_key: string; p_limit: number }
        Returns: boolean
      }
      apply_auto_decisions: {
        Args: { rows: Json }
        Returns: number
      }
      merge_accounts: {
        Args: { from_id: string; into_id: string }
        Returns: undefined
      }
      upsert_pluggy_transactions: {
        Args: { rows: Json }
        Returns: {
          inserted: number
          updated: number
        }[]
      }
    }
    Enums: {
      account_kind: "credit_card" | "checking"
      bucket:
        | "lazer"
        | "mercado"
        | "fixo"
        | "parcela"
        | "ignorar"
        | "sem_categoria"
        | "assinatura"
      budget_method: "credito" | "debito_pix"
      fixed_category: "cartao" | "emprestimo" | "veiculo" | "conta"
      income_kind: "salario" | "13o" | "freela" | "outro"
      installment_status: "ativa" | "planejada" | "quitada"
      payment_method: "credito" | "debito" | "pix"
      tx_source: "manual" | "pluggy"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_kind: ["credit_card", "checking"],
      bucket: ["lazer", "mercado", "fixo", "parcela", "ignorar", "sem_categoria", "assinatura"],
      budget_method: ["credito", "debito_pix"],
      fixed_category: ["cartao", "emprestimo", "veiculo", "conta"],
      income_kind: ["salario", "13o", "freela", "outro"],
      installment_status: ["ativa", "planejada", "quitada"],
      payment_method: ["credito", "debito", "pix"],
      tx_source: ["manual", "pluggy"],
    },
  },
} as const
