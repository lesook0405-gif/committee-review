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
      agenda_views: {
        Row: {
          agenda_id: string
          first_viewed_at: string
          member_id: string
        }
        Insert: {
          agenda_id: string
          first_viewed_at?: string
          member_id: string
        }
        Update: {
          agenda_id?: string
          first_viewed_at?: string
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agenda_views_agenda_id_fkey"
            columns: ["agenda_id"]
            isOneToOne: false
            referencedRelation: "agendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agenda_views_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      agendas: {
        Row: {
          id: string
          meeting_id: string
          pdf_path: string
          pdf_size_bytes: number
          position: number
          title: string
          uploaded_at: string
        }
        Insert: {
          id?: string
          meeting_id: string
          pdf_path: string
          pdf_size_bytes: number
          position: number
          title: string
          uploaded_at?: string
        }
        Update: {
          id?: string
          meeting_id?: string
          pdf_path?: string
          pdf_size_bytes?: number
          position?: number
          title?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agendas_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      committees: {
        Row: {
          created_at: string
          criteria: Json
          exclude_extremes: boolean
          id: string
          locked_at: string | null
          name: string
          pass_score: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          criteria: Json
          exclude_extremes?: boolean
          id?: string
          locked_at?: string | null
          name: string
          pass_score: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          criteria?: Json
          exclude_extremes?: boolean
          id?: string
          locked_at?: string | null
          name?: string
          pass_score?: number
          updated_at?: string
        }
        Relationships: []
      }
      evaluations: {
        Row: {
          agenda_id: string
          id: string
          is_proxy: boolean
          member_id: string
          scores: Json
          submitted_at: string
          total: number
          updated_at: string
        }
        Insert: {
          agenda_id: string
          id?: string
          is_proxy?: boolean
          member_id: string
          scores: Json
          submitted_at?: string
          total: number
          updated_at?: string
        }
        Update: {
          agenda_id?: string
          id?: string
          is_proxy?: boolean
          member_id?: string
          scores?: Json
          submitted_at?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluations_agenda_id_fkey"
            columns: ["agenda_id"]
            isOneToOne: false
            referencedRelation: "agendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_members: {
        Row: {
          blocked_at: string | null
          created_at: string
          id: string
          link_ciphertext: string | null
          link_fingerprint: string | null
          link_issued_at: string | null
          meeting_id: string
          member_id: string
          removed_at: string | null
        }
        Insert: {
          blocked_at?: string | null
          created_at?: string
          id?: string
          link_ciphertext?: string | null
          link_fingerprint?: string | null
          link_issued_at?: string | null
          meeting_id: string
          member_id: string
          removed_at?: string | null
        }
        Update: {
          blocked_at?: string | null
          created_at?: string
          id?: string
          link_ciphertext?: string | null
          link_fingerprint?: string | null
          link_issued_at?: string | null
          meeting_id?: string
          member_id?: string
          removed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_members_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_members_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          closed_at: string | null
          committee_id: string
          created_at: string
          id: string
          starts_at: string
          status: string
          title: string
        }
        Insert: {
          closed_at?: string | null
          committee_id: string
          created_at?: string
          id?: string
          starts_at: string
          status?: string
          title: string
        }
        Update: {
          closed_at?: string | null
          committee_id?: string
          created_at?: string
          id?: string
          starts_at?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_committee_id_fkey"
            columns: ["committee_id"]
            isOneToOne: false
            referencedRelation: "committees"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          committee_id: string
          created_at: string
          email: string
          id: string
          name: string
          phone: string
        }
        Insert: {
          committee_id: string
          created_at?: string
          email: string
          id?: string
          name: string
          phone: string
        }
        Update: {
          committee_id?: string
          created_at?: string
          email?: string
          id?: string
          name?: string
          phone?: string
        }
        Relationships: [
          {
            foreignKeyName: "members_committee_id_fkey"
            columns: ["committee_id"]
            isOneToOne: false
            referencedRelation: "committees"
            referencedColumns: ["id"]
          },
        ]
      }
      recusals: {
        Row: {
          agenda_id: string
          created_at: string
          member_id: string
        }
        Insert: {
          agenda_id: string
          created_at?: string
          member_id: string
        }
        Update: {
          agenda_id?: string
          created_at?: string
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recusals_agenda_id_fkey"
            columns: ["agenda_id"]
            isOneToOne: false
            referencedRelation: "agendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recusals_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          created_at: string
          id: string
          name: string
          role: string
        }
        Insert: {
          created_at?: string
          id: string
          name: string
          role: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          role?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      replace_agenda_pdf: {
        Args: {
          p_agenda_id: string
          p_meeting_id: string
          p_new_path: string
          p_new_size: number
        }
        Returns: Json
      }
      scoring_is_valid: {
        Args: { criteria: Json; pass_score: number }
        Returns: boolean
      }
      set_recusal: {
        Args: {
          p_agenda_id: string
          p_meeting_id: string
          p_member_id: string
          p_recused: boolean
        }
        Returns: Json
      }
      submit_evaluation: {
        Args: {
          p_agenda_id: string
          p_meeting_id: string
          p_member_id: string
          p_scores: Json
        }
        Returns: Json
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
    Enums: {},
  },
} as const
