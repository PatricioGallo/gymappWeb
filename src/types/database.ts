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
      exercises: {
        Row: {
          author_id: string | null
          category: Database["public"]["Enums"]["exercise_category"]
          created_at: string
          id: string
          image_url: string | null
          info: string
          is_builtin: boolean
          is_public: boolean
          name: string
        }
        Insert: {
          author_id?: string | null
          category: Database["public"]["Enums"]["exercise_category"]
          created_at?: string
          id?: string
          image_url?: string | null
          info: string
          is_builtin?: boolean
          is_public?: boolean
          name: string
        }
        Update: {
          author_id?: string | null
          category?: Database["public"]["Enums"]["exercise_category"]
          created_at?: string
          id?: string
          image_url?: string | null
          info?: string
          is_builtin?: boolean
          is_public?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercises_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercises_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      follows: {
        Row: {
          created_at: string
          followed_id: string
          follower_id: string
          id: string
          responded_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          followed_id: string
          follower_id: string
          id?: string
          responded_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          followed_id?: string
          follower_id?: string
          id?: string
          responded_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_followed_id_fkey"
            columns: ["followed_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_followed_id_fkey"
            columns: ["followed_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      issue_reports: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          page: string | null
          severity: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          page?: string | null
          severity?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          page?: string | null
          severity?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "issue_reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issue_reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          link: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          apellido: string
          avatar_url: string | null
          bio: string | null
          created_at: string
          email: string
          fecha_nacimiento: string
          id: string
          is_public: boolean
          links: Json
          nacionalidad: string | null
          nombre: string
          notification_prefs: Json
          updated_at: string
          user_type: Database["public"]["Enums"]["user_type"]
          username: string
          zoom_enabled: boolean
        }
        Insert: {
          apellido: string
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          email: string
          fecha_nacimiento: string
          id: string
          is_public?: boolean
          links?: Json
          nacionalidad?: string | null
          nombre: string
          notification_prefs?: Json
          updated_at?: string
          user_type?: Database["public"]["Enums"]["user_type"]
          username: string
          zoom_enabled?: boolean
        }
        Update: {
          apellido?: string
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          email?: string
          fecha_nacimiento?: string
          id?: string
          is_public?: boolean
          links?: Json
          nacionalidad?: string | null
          nombre?: string
          notification_prefs?: Json
          updated_at?: string
          user_type?: Database["public"]["Enums"]["user_type"]
          username?: string
          zoom_enabled?: boolean
        }
        Relationships: []
      }
      roadmap_tasks: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          position: number
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          position?: number
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          position?: number
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roadmap_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roadmap_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      routine_days: {
        Row: {
          dia_semana: number
          id: string
          nombre: string | null
          week_id: string
        }
        Insert: {
          dia_semana: number
          id?: string
          nombre?: string | null
          week_id: string
        }
        Update: {
          dia_semana?: number
          id?: string
          nombre?: string | null
          week_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "routine_days_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "routine_weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      routine_exercises: {
        Row: {
          day_id: string
          es_medible: boolean
          exercise_id: string
          id: string
          info_snapshot: string
          mismo_peso: boolean
          nombre_snapshot: string
          nota: string | null
          orden: number
          repe: number
          repe_max: number | null
          serie: number
        }
        Insert: {
          day_id: string
          es_medible?: boolean
          exercise_id: string
          id?: string
          info_snapshot: string
          mismo_peso?: boolean
          nombre_snapshot: string
          nota?: string | null
          orden?: number
          repe: number
          repe_max?: number | null
          serie: number
        }
        Update: {
          day_id?: string
          es_medible?: boolean
          exercise_id?: string
          id?: string
          info_snapshot?: string
          mismo_peso?: boolean
          nombre_snapshot?: string
          nota?: string | null
          orden?: number
          repe?: number
          repe_max?: number | null
          serie?: number
        }
        Relationships: [
          {
            foreignKeyName: "routine_exercises_day_id_fkey"
            columns: ["day_id"]
            isOneToOne: false
            referencedRelation: "routine_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routine_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      routine_weeks: {
        Row: {
          id: string
          numero: number
          routine_id: string
        }
        Insert: {
          id?: string
          numero: number
          routine_id: string
        }
        Update: {
          id?: string
          numero?: number
          routine_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "routine_weeks_routine_id_fkey"
            columns: ["routine_id"]
            isOneToOne: false
            referencedRelation: "routines"
            referencedColumns: ["id"]
          },
        ]
      }
      routines: {
        Row: {
          assigned_by: string | null
          created_at: string
          fecha_inicio: string
          finalizada_at: string | null
          id: string
          is_public: boolean
          is_shareable: boolean
          nombre: string
          share_token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          fecha_inicio?: string
          finalizada_at?: string | null
          id?: string
          is_public?: boolean
          is_shareable?: boolean
          nombre: string
          share_token?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          fecha_inicio?: string
          finalizada_at?: string | null
          id?: string
          is_public?: boolean
          is_shareable?: boolean
          nombre?: string
          share_token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "routines_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routines_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routines_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routines_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      site_visits: {
        Row: {
          created_at: string
          id: string
          path: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          path: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          path?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_visits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_visits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      user_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      weight_logs: {
        Row: {
          created_at: string
          exercise_id: string
          fecha: string
          id: string
          peso: number
          repe: number | null
          routine_exercise_id: string | null
          serie: number | null
          unidad: Database["public"]["Enums"]["weight_unit"]
          user_id: string
        }
        Insert: {
          created_at?: string
          exercise_id: string
          fecha: string
          id?: string
          peso: number
          repe?: number | null
          routine_exercise_id?: string | null
          serie?: number | null
          unidad?: Database["public"]["Enums"]["weight_unit"]
          user_id: string
        }
        Update: {
          created_at?: string
          exercise_id?: string
          fecha?: string
          id?: string
          peso?: number
          repe?: number | null
          routine_exercise_id?: string | null
          serie?: number | null
          unidad?: Database["public"]["Enums"]["weight_unit"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "weight_logs_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weight_logs_routine_exercise_id_fkey"
            columns: ["routine_exercise_id"]
            isOneToOne: false
            referencedRelation: "routine_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weight_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weight_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      profiles_public: {
        Row: {
          apellido: string | null
          avatar_url: string | null
          bio: string | null
          fecha_nacimiento: string | null
          id: string | null
          is_public: boolean | null
          links: Json | null
          nacionalidad: string | null
          nombre: string | null
          user_type: Database["public"]["Enums"]["user_type"] | null
          username: string | null
        }
        Insert: {
          apellido?: string | null
          avatar_url?: string | null
          bio?: string | null
          fecha_nacimiento?: string | null
          id?: string | null
          is_public?: boolean | null
          links?: Json | null
          nacionalidad?: string | null
          nombre?: string | null
          user_type?: Database["public"]["Enums"]["user_type"] | null
          username?: string | null
        }
        Update: {
          apellido?: string | null
          avatar_url?: string | null
          bio?: string | null
          fecha_nacimiento?: string | null
          id?: string | null
          is_public?: boolean | null
          links?: Json | null
          nacionalidad?: string | null
          nombre?: string | null
          user_type?: Database["public"]["Enums"]["user_type"] | null
          username?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_daily_visits: {
        Args: { p_days?: number }
        Returns: {
          count: number
          day: string
        }[]
      }
      admin_list_users: {
        Args: never
        Returns: {
          apellido: string
          avatar_url: string
          created_at: string
          email: string
          email_confirmed: boolean
          fecha_nacimiento: string
          id: string
          last_sign_in_at: string
          nacionalidad: string
          nombre: string
          routines_count: number
          user_type: Database["public"]["Enums"]["user_type"]
          username: string
        }[]
      }
      admin_send_notification: {
        Args: {
          p_body: string
          p_link?: string
          p_title: string
          p_user_id: string
        }
        Returns: number
      }
      admin_site_stats: { Args: never; Returns: Json }
      can_access_day: { Args: { did: string }; Returns: boolean }
      can_access_routine: { Args: { rid: string }; Returns: boolean }
      can_access_week: { Args: { wid: string }; Returns: boolean }
      can_view_day: { Args: { did: string }; Returns: boolean }
      can_view_routine: { Args: { rid: string }; Returns: boolean }
      can_view_week: { Args: { wid: string }; Returns: boolean }
      create_routine: {
        Args: {
          p_fecha_inicio: string
          p_is_public?: boolean
          p_nombre: string
          p_user_id: string
          p_weeks: Json
        }
        Returns: string
      }
      current_user_type: {
        Args: never
        Returns: Database["public"]["Enums"]["user_type"]
      }
      get_email_by_username: { Args: { p_username: string }; Returns: string }
      get_follow_counts: {
        Args: { p_user_id: string }
        Returns: {
          followers: number
          following: number
        }[]
      }
      get_follow_status: { Args: { p_target_id: string }; Returns: string }
      get_shared_routine: { Args: { p_token: string }; Returns: Json }
      is_admin: { Args: never; Returns: boolean }
      is_profile_public: { Args: { uid: string }; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      list_followers: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_user_id: string
        }
        Returns: {
          apellido: string
          avatar_url: string
          followed_at: string
          id: string
          nombre: string
          user_type: Database["public"]["Enums"]["user_type"]
          username: string
        }[]
      }
      list_following: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_user_id: string
        }
        Returns: {
          apellido: string
          avatar_url: string
          followed_at: string
          id: string
          nombre: string
          user_type: Database["public"]["Enums"]["user_type"]
          username: string
        }[]
      }
      search_profiles: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          apellido: string
          avatar_url: string
          id: string
          nacionalidad: string
          nombre: string
          score: number
          user_type: Database["public"]["Enums"]["user_type"]
          username: string
        }[]
      }
    }
    Enums: {
      exercise_category:
        | "hombros"
        | "pectorales"
        | "espalda"
        | "brazos"
        | "abdominales"
        | "piernas"
        | "estiramiento"
      user_type: "admin" | "gimnasio" | "entrenador" | "usuario" | "colaborador"
      weight_unit: "kg" | "lb" | "bloques"
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
    Enums: {
      exercise_category: [
        "hombros",
        "pectorales",
        "espalda",
        "brazos",
        "abdominales",
        "piernas",
        "estiramiento",
      ],
      user_type: ["admin", "gimnasio", "entrenador", "usuario", "colaborador"],
      weight_unit: ["kg", "lb", "bloques"],
    },
  },
} as const
