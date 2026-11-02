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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      credits: {
        Row: {
          balance: number
          created_at: string
          id: string
          plan: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          id?: string
          plan?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          id?: string
          plan?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      projects: {
        Row: {
          created_at: string
          credits_used: number
          duration_seconds: number | null
          error_message: string | null
          id: string
          intensity: Database["public"]["Enums"]["intensity_level"]
          output_audio_path: string | null
          output_audio_url: string | null
          output_video_url: string | null
          progress: number | null
          reference_audio_url: string | null
          script: string
          source_language: string
          status: Database["public"]["Enums"]["project_status"]
          target_language: string
          title: string
          translated_text: string | null
          updated_at: string
          user_id: string
          video_format: Database["public"]["Enums"]["video_format"]
          voice_type: string
        }
        Insert: {
          created_at?: string
          credits_used?: number
          duration_seconds?: number | null
          error_message?: string | null
          id?: string
          intensity?: Database["public"]["Enums"]["intensity_level"]
          output_audio_path?: string | null
          output_audio_url?: string | null
          output_video_url?: string | null
          progress?: number | null
          reference_audio_url?: string | null
          script: string
          source_language?: string
          status?: Database["public"]["Enums"]["project_status"]
          target_language?: string
          title: string
          translated_text?: string | null
          updated_at?: string
          user_id: string
          video_format?: Database["public"]["Enums"]["video_format"]
          voice_type?: string
        }
        Update: {
          created_at?: string
          credits_used?: number
          duration_seconds?: number | null
          error_message?: string | null
          id?: string
          intensity?: Database["public"]["Enums"]["intensity_level"]
          output_audio_path?: string | null
          output_audio_url?: string | null
          output_video_url?: string | null
          progress?: number | null
          reference_audio_url?: string | null
          script?: string
          source_language?: string
          status?: Database["public"]["Enums"]["project_status"]
          target_language?: string
          title?: string
          translated_text?: string | null
          updated_at?: string
          user_id?: string
          video_format?: Database["public"]["Enums"]["video_format"]
          voice_type?: string
        }
        Relationships: []
      }
      teaching_book_notes: {
        Row: {
          book_title: string
          chapter_index: number
          chapter_title: string
          created_at: string
          id: string
          key_idea: string
          level: number
          short_quote: string | null
          theme: string
          user_id: string
        }
        Insert: {
          book_title: string
          chapter_index: number
          chapter_title: string
          created_at?: string
          id?: string
          key_idea: string
          level: number
          short_quote?: string | null
          theme: string
          user_id: string
        }
        Update: {
          book_title?: string
          chapter_index?: number
          chapter_title?: string
          created_at?: string
          id?: string
          key_idea?: string
          level?: number
          short_quote?: string | null
          theme?: string
          user_id?: string
        }
        Relationships: []
      }
      teaching_lessons: {
        Row: {
          card: Json
          created_at: string
          formats: Json
          id: string
          level: number
          path_id: string
          position: number
          publish_date: string | null
          source_note_ids: string[]
          source_project_ids: string[]
          status: Database["public"]["Enums"]["lesson_status"]
          title: string
          updated_at: string
          user_id: string
          week: number
        }
        Insert: {
          card: Json
          created_at?: string
          formats?: Json
          id?: string
          level: number
          path_id: string
          position: number
          publish_date?: string | null
          source_note_ids?: string[]
          source_project_ids?: string[]
          status?: Database["public"]["Enums"]["lesson_status"]
          title: string
          updated_at?: string
          user_id: string
          week: number
        }
        Update: {
          card?: Json
          created_at?: string
          formats?: Json
          id?: string
          level?: number
          path_id?: string
          position?: number
          publish_date?: string | null
          source_note_ids?: string[]
          source_project_ids?: string[]
          status?: Database["public"]["Enums"]["lesson_status"]
          title?: string
          updated_at?: string
          user_id?: string
          week?: number
        }
        Relationships: [
          {
            foreignKeyName: "teaching_lessons_path_id_fkey"
            columns: ["path_id"]
            isOneToOne: false
            referencedRelation: "teaching_paths"
            referencedColumns: ["id"]
          },
        ]
      }
      teaching_paths: {
        Row: {
          audience_line: string
          created_at: string
          id: string
          plan: Json
          start_date: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          audience_line?: string
          created_at?: string
          id?: string
          plan: Json
          start_date: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          audience_line?: string
          created_at?: string
          id?: string
          plan?: Json
          start_date?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      teaching_sources: {
        Row: {
          created_at: string
          examples: Json
          id: string
          key_idea: string
          level: number
          project_id: string
          short_quote: string | null
          theme: string
          user_id: string
        }
        Insert: {
          created_at?: string
          examples?: Json
          id?: string
          key_idea: string
          level: number
          project_id: string
          short_quote?: string | null
          theme: string
          user_id: string
        }
        Update: {
          created_at?: string
          examples?: Json
          id?: string
          key_idea?: string
          level?: number
          project_id?: string
          short_quote?: string | null
          theme?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teaching_sources_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      intensity_level: "low" | "medium" | "high"
      lesson_status: "draft" | "reviewed" | "published"
      project_status: "draft" | "processing" | "completed" | "failed"
      video_format: "youtube" | "shorts"
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
      app_role: ["admin", "moderator", "user"],
      intensity_level: ["low", "medium", "high"],
      lesson_status: ["draft", "reviewed", "published"],
      project_status: ["draft", "processing", "completed", "failed"],
      video_format: ["youtube", "shorts"],
    },
  },
} as const
