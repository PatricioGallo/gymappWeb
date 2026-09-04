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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      body_weight_logs: {
        Row: {
          created_at: string
          fecha: string
          id: string
          peso: number
          unidad: string
          user_id: string
        }
        Insert: {
          created_at?: string
          fecha: string
          id?: string
          peso: number
          unidad?: string
          user_id: string
        }
        Update: {
          created_at?: string
          fecha?: string
          id?: string
          peso?: number
          unidad?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "body_weight_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "body_weight_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_likes: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_mentions: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          mentioned_user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          mentioned_user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          mentioned_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_mentions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_mentions_mentioned_user_id_fkey"
            columns: ["mentioned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_mentions_mentioned_user_id_fkey"
            columns: ["mentioned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_message_replies: {
        Row: {
          body: string
          contact_message_id: string
          created_at: string
          id: string
          sent_by: string | null
          subject: string
          to_email: string
        }
        Insert: {
          body: string
          contact_message_id: string
          created_at?: string
          id?: string
          sent_by?: string | null
          subject: string
          to_email: string
        }
        Update: {
          body?: string
          contact_message_id?: string
          created_at?: string
          id?: string
          sent_by?: string | null
          subject?: string
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_message_replies_contact_message_id_fkey"
            columns: ["contact_message_id"]
            isOneToOne: false
            referencedRelation: "contact_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_message_replies_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_message_replies_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_messages: {
        Row: {
          created_at: string
          email: string
          id: string
          is_read: boolean
          message: string
          name: string
          read_by: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          is_read?: boolean
          message: string
          name: string
          read_by?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          is_read?: boolean
          message?: string
          name?: string
          read_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_messages_read_by_fkey"
            columns: ["read_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_messages_read_by_fkey"
            columns: ["read_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          joined_at: string
          last_read_at: string
          left_at: string | null
          role: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          joined_at?: string
          last_read_at?: string
          left_at?: string | null
          role?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          joined_at?: string
          last_read_at?: string
          left_at?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          group_avatar_url: string | null
          group_name: string | null
          id: string
          initiator_id: string
          kind: string
          last_message_at: string
          last_message_preview: string | null
          last_message_sender_id: string | null
          last_message_type: string | null
          pinned_message_id: string | null
          status: string
          user1_id: string | null
          user2_id: string | null
        }
        Insert: {
          created_at?: string
          group_avatar_url?: string | null
          group_name?: string | null
          id?: string
          initiator_id: string
          kind?: string
          last_message_at?: string
          last_message_preview?: string | null
          last_message_sender_id?: string | null
          last_message_type?: string | null
          pinned_message_id?: string | null
          status?: string
          user1_id?: string | null
          user2_id?: string | null
        }
        Update: {
          created_at?: string
          group_avatar_url?: string | null
          group_name?: string | null
          id?: string
          initiator_id?: string
          kind?: string
          last_message_at?: string
          last_message_preview?: string | null
          last_message_sender_id?: string | null
          last_message_type?: string | null
          pinned_message_id?: string | null
          status?: string
          user1_id?: string | null
          user2_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_initiator_id_fkey"
            columns: ["initiator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_initiator_id_fkey"
            columns: ["initiator_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_last_message_sender_id_fkey"
            columns: ["last_message_sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_last_message_sender_id_fkey"
            columns: ["last_message_sender_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_pinned_message_id_fkey"
            columns: ["pinned_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_user1_id_fkey"
            columns: ["user1_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_user1_id_fkey"
            columns: ["user1_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_user2_id_fkey"
            columns: ["user2_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_user2_id_fkey"
            columns: ["user2_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      error_reports: {
        Row: {
          created_at: string
          created_by: string
          id: string
          is_read: boolean
          message: string | null
          page: string | null
          read_by: string | null
          subject: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          is_read?: boolean
          message?: string | null
          page?: string | null
          read_by?: string | null
          subject: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          is_read?: boolean
          message?: string | null
          page?: string | null
          read_by?: string | null
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "error_reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "error_reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "error_reports_read_by_fkey"
            columns: ["read_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "error_reports_read_by_fkey"
            columns: ["read_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      exercise_comments: {
        Row: {
          comment: string
          created_at: string
          fecha: string
          id: string
          routine_exercise_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          comment: string
          created_at?: string
          fecha: string
          id?: string
          routine_exercise_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          comment?: string
          created_at?: string
          fecha?: string
          id?: string
          routine_exercise_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercise_comments_routine_exercise_id_fkey"
            columns: ["routine_exercise_id"]
            isOneToOne: false
            referencedRelation: "routine_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercise_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercise_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      exercises: {
        Row: {
          author_id: string | null
          category: Database["public"]["Enums"]["exercise_category"]
          created_at: string
          id: string
          info: string
          is_builtin: boolean
          is_public: boolean
          media_urls: string[]
          name: string
        }
        Insert: {
          author_id?: string | null
          category: Database["public"]["Enums"]["exercise_category"]
          created_at?: string
          id?: string
          info: string
          is_builtin?: boolean
          is_public?: boolean
          media_urls?: string[]
          name: string
        }
        Update: {
          author_id?: string | null
          category?: Database["public"]["Enums"]["exercise_category"]
          created_at?: string
          id?: string
          info?: string
          is_builtin?: boolean
          is_public?: boolean
          media_urls?: string[]
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
      gym_class_enrollments: {
        Row: {
          class_id: string
          enrolled_at: string
          id: string
          member_id: string
          reminder_sent_at: string | null
          session_date: string
          session_id: string
        }
        Insert: {
          class_id: string
          enrolled_at?: string
          id?: string
          member_id: string
          reminder_sent_at?: string | null
          session_date?: string
          session_id: string
        }
        Update: {
          class_id?: string
          enrolled_at?: string
          id?: string
          member_id?: string
          reminder_sent_at?: string | null
          session_date?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gym_class_enrollments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "gym_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gym_class_enrollments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gym_class_enrollments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gym_class_enrollments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "gym_class_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      gym_class_sessions: {
        Row: {
          class_id: string
          day_of_week: number
          end_time: string
          id: string
          start_time: string
        }
        Insert: {
          class_id: string
          day_of_week: number
          end_time: string
          id?: string
          start_time: string
        }
        Update: {
          class_id?: string
          day_of_week?: number
          end_time?: string
          id?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "gym_class_sessions_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "gym_classes"
            referencedColumns: ["id"]
          },
        ]
      }
      gym_classes: {
        Row: {
          allow_enrollment: boolean
          capacity: number | null
          created_at: string
          description: string | null
          gym_id: string
          id: string
          image_url: string | null
          instructor_id: string | null
          name: string
          updated_at: string
        }
        Insert: {
          allow_enrollment?: boolean
          capacity?: number | null
          created_at?: string
          description?: string | null
          gym_id: string
          id?: string
          image_url?: string | null
          instructor_id?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          allow_enrollment?: boolean
          capacity?: number | null
          created_at?: string
          description?: string | null
          gym_id?: string
          id?: string
          image_url?: string | null
          instructor_id?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gym_classes_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gym_classes_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gym_classes_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gym_classes_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      gym_members: {
        Row: {
          duration_months: number | null
          ended_at: string | null
          expires_at: string | null
          gym_id: string
          id: string
          member_id: string
          membership_type: string | null
          requested_at: string
          responded_at: string | null
          status: string
        }
        Insert: {
          duration_months?: number | null
          ended_at?: string | null
          expires_at?: string | null
          gym_id: string
          id?: string
          member_id: string
          membership_type?: string | null
          requested_at?: string
          responded_at?: string | null
          status?: string
        }
        Update: {
          duration_months?: number | null
          ended_at?: string | null
          expires_at?: string | null
          gym_id?: string
          id?: string
          member_id?: string
          membership_type?: string | null
          requested_at?: string
          responded_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "gym_members_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gym_members_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gym_members_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gym_members_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      gym_post_comments: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          post_id: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          post_id: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gym_post_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gym_post_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gym_post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "gym_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      gym_post_likes: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gym_post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "gym_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gym_post_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gym_post_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      gym_post_media: {
        Row: {
          created_at: string
          id: string
          media_type: string
          media_url: string
          position: number
          post_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          media_type: string
          media_url: string
          position?: number
          post_id: string
        }
        Update: {
          created_at?: string
          id?: string
          media_type?: string
          media_url?: string
          position?: number
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gym_post_media_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "gym_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      gym_posts: {
        Row: {
          content: string | null
          created_at: string
          cross_posted_rep_id: string | null
          gym_id: string
          id: string
          location: string | null
          pinned: boolean
          pinned_at: string | null
          updated_at: string
          visibility: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          cross_posted_rep_id?: string | null
          gym_id: string
          id?: string
          location?: string | null
          pinned?: boolean
          pinned_at?: string | null
          updated_at?: string
          visibility?: string
        }
        Update: {
          content?: string | null
          created_at?: string
          cross_posted_rep_id?: string | null
          gym_id?: string
          id?: string
          location?: string | null
          pinned?: boolean
          pinned_at?: string | null
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "gym_posts_cross_posted_rep_id_fkey"
            columns: ["cross_posted_rep_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gym_posts_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gym_posts_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      gym_trainer_ratings: {
        Row: {
          comment: string | null
          created_at: string
          gym_id: string
          id: string
          member_id: string
          rating: number
          trainer_id: string
          updated_at: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          gym_id: string
          id?: string
          member_id: string
          rating: number
          trainer_id: string
          updated_at?: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          gym_id?: string
          id?: string
          member_id?: string
          rating?: number
          trainer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gym_trainer_ratings_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gym_trainer_ratings_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gym_trainer_ratings_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gym_trainer_ratings_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gym_trainer_ratings_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gym_trainer_ratings_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      gym_trainers: {
        Row: {
          duration_months: number | null
          ended_at: string | null
          expires_at: string | null
          gym_id: string
          id: string
          initiated_by: string
          membership_type: string | null
          requested_at: string
          responded_at: string | null
          status: string
          trainer_id: string
        }
        Insert: {
          duration_months?: number | null
          ended_at?: string | null
          expires_at?: string | null
          gym_id: string
          id?: string
          initiated_by: string
          membership_type?: string | null
          requested_at?: string
          responded_at?: string | null
          status?: string
          trainer_id: string
        }
        Update: {
          duration_months?: number | null
          ended_at?: string | null
          expires_at?: string | null
          gym_id?: string
          id?: string
          initiated_by?: string
          membership_type?: string | null
          requested_at?: string
          responded_at?: string | null
          status?: string
          trainer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gym_trainers_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gym_trainers_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gym_trainers_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gym_trainers_trainer_id_fkey"
            columns: ["trainer_id"]
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
      message_view_once_opens: {
        Row: {
          message_id: string
          user_id: string
          viewed_at: string
        }
        Insert: {
          message_id: string
          user_id: string
          viewed_at?: string
        }
        Update: {
          message_id?: string
          user_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_view_once_opens_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_view_once_opens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_view_once_opens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachment_duration_seconds: number | null
          attachment_filename: string | null
          attachment_path: string | null
          attachment_type: string | null
          content: string | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          is_forwarded: boolean
          reactions: Json
          read_at: string | null
          reply_to_message_id: string | null
          sender_id: string
          shared_gym_post_id: string | null
          shared_post_id: string | null
          view_once: boolean
          viewed_once_at: string | null
          viewed_once_by: string | null
        }
        Insert: {
          attachment_duration_seconds?: number | null
          attachment_filename?: string | null
          attachment_path?: string | null
          attachment_type?: string | null
          content?: string | null
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          is_forwarded?: boolean
          reactions?: Json
          read_at?: string | null
          reply_to_message_id?: string | null
          sender_id: string
          shared_gym_post_id?: string | null
          shared_post_id?: string | null
          view_once?: boolean
          viewed_once_at?: string | null
          viewed_once_by?: string | null
        }
        Update: {
          attachment_duration_seconds?: number | null
          attachment_filename?: string | null
          attachment_path?: string | null
          attachment_type?: string | null
          content?: string | null
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          is_forwarded?: boolean
          reactions?: Json
          read_at?: string | null
          reply_to_message_id?: string | null
          sender_id?: string
          shared_gym_post_id?: string | null
          shared_post_id?: string | null
          view_once?: boolean
          viewed_once_at?: string | null
          viewed_once_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_shared_gym_post_id_fkey"
            columns: ["shared_gym_post_id"]
            isOneToOne: false
            referencedRelation: "gym_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_shared_post_id_fkey"
            columns: ["shared_post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_viewed_once_by_fkey"
            columns: ["viewed_once_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_viewed_once_by_fkey"
            columns: ["viewed_once_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
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
          actor_id?: string | null
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
          actor_id?: string | null
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
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
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
      post_comments: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          likes_count: number
          parent_comment_id: string | null
          post_id: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          likes_count?: number
          parent_comment_id?: string | null
          post_id: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          likes_count?: number
          parent_comment_id?: string | null
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_likes: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      post_mentions: {
        Row: {
          created_at: string
          id: string
          mentioned_user_id: string
          post_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mentioned_user_id: string
          post_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mentioned_user_id?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_mentions_mentioned_user_id_fkey"
            columns: ["mentioned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_mentions_mentioned_user_id_fkey"
            columns: ["mentioned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_mentions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_poll_votes: {
        Row: {
          created_at: string
          id: string
          option_index: number
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          option_index: number
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          option_index?: number
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_poll_votes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_poll_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_poll_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      post_reposts: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_reposts_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_reposts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_reposts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      post_views: {
        Row: {
          created_at: string
          id: string
          post_id: string
          viewer_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          viewer_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          viewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_views_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_views_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_views_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          author_id: string
          comments_count: number
          content: string | null
          created_at: string
          id: string
          likes_count: number
          link_description: string | null
          link_image_url: string | null
          link_site_name: string | null
          link_title: string | null
          link_url: string | null
          media_type: string | null
          media_url: string | null
          poll_ends_at: string | null
          poll_multi: boolean
          poll_options: string[] | null
          poll_vote_counts: number[] | null
          quoted_post_id: string | null
          quotes_count: number
          reposts_count: number
          thread_parent_id: string | null
          thread_root_id: string | null
          updated_at: string
          views_count: number
          youtube_video_id: string | null
        }
        Insert: {
          author_id: string
          comments_count?: number
          content?: string | null
          created_at?: string
          id?: string
          likes_count?: number
          link_description?: string | null
          link_image_url?: string | null
          link_site_name?: string | null
          link_title?: string | null
          link_url?: string | null
          media_type?: string | null
          media_url?: string | null
          poll_ends_at?: string | null
          poll_multi?: boolean
          poll_options?: string[] | null
          poll_vote_counts?: number[] | null
          quoted_post_id?: string | null
          quotes_count?: number
          reposts_count?: number
          thread_parent_id?: string | null
          thread_root_id?: string | null
          updated_at?: string
          views_count?: number
          youtube_video_id?: string | null
        }
        Update: {
          author_id?: string
          comments_count?: number
          content?: string | null
          created_at?: string
          id?: string
          likes_count?: number
          link_description?: string | null
          link_image_url?: string | null
          link_site_name?: string | null
          link_title?: string | null
          link_url?: string | null
          media_type?: string | null
          media_url?: string | null
          poll_ends_at?: string | null
          poll_multi?: boolean
          poll_options?: string[] | null
          poll_vote_counts?: number[] | null
          quoted_post_id?: string | null
          quotes_count?: number
          reposts_count?: number
          thread_parent_id?: string | null
          thread_root_id?: string | null
          updated_at?: string
          views_count?: number
          youtube_video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_quoted_post_id_fkey"
            columns: ["quoted_post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_thread_parent_id_fkey"
            columns: ["thread_parent_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_thread_root_id_fkey"
            columns: ["thread_root_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_visits: {
        Row: {
          last_visited_at: string
          visit_count: number
          visited_id: string
          visitor_id: string
        }
        Insert: {
          last_visited_at?: string
          visit_count?: number
          visited_id: string
          visitor_id: string
        }
        Update: {
          last_visited_at?: string
          visit_count?: number
          visited_id?: string
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_visits_visited_id_fkey"
            columns: ["visited_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_visits_visited_id_fkey"
            columns: ["visited_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_visits_visitor_id_fkey"
            columns: ["visitor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_visits_visitor_id_fkey"
            columns: ["visitor_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          apellido: string
          avatar_url: string | null
          bio: string | null
          business_hours: Json | null
          ciudad: string | null
          class_reminder_minutes: number | null
          created_at: string
          email: string
          fecha_nacimiento: string
          genero: string | null
          id: string
          is_public: boolean
          is_verified: boolean
          last_seen_at: string | null
          links: Json
          maps_url: string | null
          nacionalidad: string | null
          nombre: string
          notification_prefs: Json
          provincia: string | null
          pwa_installed: boolean
          pwa_last_seen_at: string | null
          show_last_seen: boolean
          show_read_receipts: boolean
          show_stats: boolean
          stats_widgets: Json
          updated_at: string
          user_type: Database["public"]["Enums"]["user_type"]
          username: string
          zoom_enabled: boolean
        }
        Insert: {
          address?: string | null
          apellido: string
          avatar_url?: string | null
          bio?: string | null
          business_hours?: Json | null
          ciudad?: string | null
          class_reminder_minutes?: number | null
          created_at?: string
          email: string
          fecha_nacimiento: string
          genero?: string | null
          id: string
          is_public?: boolean
          is_verified?: boolean
          last_seen_at?: string | null
          links?: Json
          maps_url?: string | null
          nacionalidad?: string | null
          nombre: string
          notification_prefs?: Json
          provincia?: string | null
          pwa_installed?: boolean
          pwa_last_seen_at?: string | null
          show_last_seen?: boolean
          show_read_receipts?: boolean
          show_stats?: boolean
          stats_widgets?: Json
          updated_at?: string
          user_type?: Database["public"]["Enums"]["user_type"]
          username: string
          zoom_enabled?: boolean
        }
        Update: {
          address?: string | null
          apellido?: string
          avatar_url?: string | null
          bio?: string | null
          business_hours?: Json | null
          ciudad?: string | null
          class_reminder_minutes?: number | null
          created_at?: string
          email?: string
          fecha_nacimiento?: string
          genero?: string | null
          id?: string
          is_public?: boolean
          is_verified?: boolean
          last_seen_at?: string | null
          links?: Json
          maps_url?: string | null
          nacionalidad?: string | null
          nombre?: string
          notification_prefs?: Json
          provincia?: string | null
          pwa_installed?: boolean
          pwa_last_seen_at?: string | null
          show_last_seen?: boolean
          show_read_receipts?: boolean
          show_stats?: boolean
          stats_widgets?: Json
          updated_at?: string
          user_type?: Database["public"]["Enums"]["user_type"]
          username?: string
          zoom_enabled?: boolean
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          created_at: string
          id: string
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          platform: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
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
      routine_day_completions: {
        Row: {
          created_at: string
          id: string
          routine_day_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          routine_day_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          routine_day_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "routine_day_completions_routine_day_id_fkey"
            columns: ["routine_day_id"]
            isOneToOne: false
            referencedRelation: "routine_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routine_day_completions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routine_day_completions_user_id_fkey"
            columns: ["user_id"]
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
          copied_from_user_id: string | null
          created_at: string
          fecha_inicio: string
          finalizada_at: string | null
          id: string
          is_public: boolean
          is_shareable: boolean
          is_template: boolean
          nombre: string
          share_token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          copied_from_user_id?: string | null
          created_at?: string
          fecha_inicio?: string
          finalizada_at?: string | null
          id?: string
          is_public?: boolean
          is_shareable?: boolean
          is_template?: boolean
          nombre: string
          share_token?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          copied_from_user_id?: string | null
          created_at?: string
          fecha_inicio?: string
          finalizada_at?: string | null
          id?: string
          is_public?: boolean
          is_shareable?: boolean
          is_template?: boolean
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
            foreignKeyName: "routines_copied_from_user_id_fkey"
            columns: ["copied_from_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routines_copied_from_user_id_fkey"
            columns: ["copied_from_user_id"]
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
      subscriptions: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          responded_at: string | null
          status: string
          subscriber_id: string
          trainer_id: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          responded_at?: string | null
          status?: string
          subscriber_id: string
          trainer_id: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          responded_at?: string | null
          status?: string
          subscriber_id?: string
          trainer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_subscriber_id_fkey"
            columns: ["subscriber_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_subscriber_id_fkey"
            columns: ["subscriber_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_trainer_id_fkey"
            columns: ["trainer_id"]
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
      user_reports: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          read_by: string | null
          reason: string
          reported_user_id: string
          reporter_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          read_by?: string | null
          reason: string
          reported_user_id: string
          reporter_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          read_by?: string | null
          reason?: string
          reported_user_id?: string
          reporter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_reports_read_by_fkey"
            columns: ["read_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_read_by_fkey"
            columns: ["read_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_reported_user_id_fkey"
            columns: ["reported_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_reported_user_id_fkey"
            columns: ["reported_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      user_stickers: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id: string
          storage_path: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_stickers_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_stickers_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_requests: {
        Row: {
          admin_note: string | null
          applicant_type: string
          created_at: string
          credentials: Json
          documents: Json
          gym_details: Json | null
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          applicant_type: string
          created_at?: string
          credentials?: Json
          documents?: Json
          gym_details?: Json | null
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          applicant_type?: string
          created_at?: string
          credentials?: Json
          documents?: Json
          gym_details?: Json | null
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_requests_user_id_fkey"
            columns: ["user_id"]
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
          address: string | null
          apellido: string | null
          avatar_url: string | null
          bio: string | null
          business_hours: Json | null
          fecha_nacimiento: string | null
          id: string | null
          is_public: boolean | null
          is_verified: boolean | null
          links: Json | null
          maps_url: string | null
          nacionalidad: string | null
          nombre: string | null
          show_stats: boolean | null
          stats_widgets: Json | null
          user_type: Database["public"]["Enums"]["user_type"] | null
          username: string | null
        }
        Insert: {
          address?: string | null
          apellido?: string | null
          avatar_url?: string | null
          bio?: string | null
          business_hours?: Json | null
          fecha_nacimiento?: string | null
          id?: string | null
          is_public?: boolean | null
          is_verified?: boolean | null
          links?: Json | null
          maps_url?: string | null
          nacionalidad?: string | null
          nombre?: string | null
          show_stats?: boolean | null
          stats_widgets?: Json | null
          user_type?: Database["public"]["Enums"]["user_type"] | null
          username?: string | null
        }
        Update: {
          address?: string | null
          apellido?: string | null
          avatar_url?: string | null
          bio?: string | null
          business_hours?: Json | null
          fecha_nacimiento?: string | null
          id?: string | null
          is_public?: boolean | null
          is_verified?: boolean | null
          links?: Json | null
          maps_url?: string | null
          nacionalidad?: string | null
          nombre?: string | null
          show_stats?: boolean | null
          stats_widgets?: Json | null
          user_type?: Database["public"]["Enums"]["user_type"] | null
          username?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_message_request: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      add_group_participants: {
        Args: { p_conversation_id: string; p_user_ids: string[] }
        Returns: undefined
      }
      admin_daily_visits: {
        Args: { p_days?: number }
        Returns: {
          count: number
          day: string
        }[]
      }
      admin_delete_user: { Args: { p_user_id: string }; Returns: undefined }
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
          is_verified: boolean
          last_seen_at: string
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
      can_interact_with_post_author: {
        Args: { p_author_id: string }
        Returns: boolean
      }
      can_view_day: { Args: { did: string }; Returns: boolean }
      can_view_gym_post: {
        Args: { p_gym_id: string; p_visibility: string }
        Returns: boolean
      }
      can_view_routine: { Args: { rid: string }; Returns: boolean }
      can_view_week: { Args: { wid: string }; Returns: boolean }
      cancel_subscription: {
        Args: { p_subscriber_id: string; p_trainer_id: string }
        Returns: undefined
      }
      create_group_conversation: {
        Args: { p_avatar_url?: string; p_member_ids?: string[]; p_name: string }
        Returns: string
      }
      create_gym_post: {
        Args: {
          p_content: string
          p_gym_id: string
          p_location: string
          p_media: Json
          p_visibility: string
        }
        Returns: string
      }
      create_routine: {
        Args: {
          p_copied_from_user_id?: string
          p_fecha_inicio: string
          p_is_public?: boolean
          p_is_template?: boolean
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
      decline_message_request: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      delete_message: {
        Args: { p_message_id: string }
        Returns: {
          attachment_duration_seconds: number | null
          attachment_filename: string | null
          attachment_path: string | null
          attachment_type: string | null
          content: string | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          is_forwarded: boolean
          reactions: Json
          read_at: string | null
          reply_to_message_id: string | null
          sender_id: string
          shared_gym_post_id: string | null
          shared_post_id: string | null
          view_once: boolean
          viewed_once_at: string | null
          viewed_once_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      edit_message: {
        Args: { p_content: string; p_message_id: string }
        Returns: {
          attachment_duration_seconds: number | null
          attachment_filename: string | null
          attachment_path: string | null
          attachment_type: string | null
          content: string | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          is_forwarded: boolean
          reactions: Json
          read_at: string | null
          reply_to_message_id: string | null
          sender_id: string
          shared_gym_post_id: string | null
          shared_post_id: string | null
          view_once: boolean
          viewed_once_at: string | null
          viewed_once_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      end_gym_membership: {
        Args: { p_gym_id: string; p_member_id: string }
        Returns: undefined
      }
      end_gym_trainer_handle: {
        Args: { p_gym_id: string; p_trainer_id: string }
        Returns: undefined
      }
      get_block_status: { Args: { p_target_id: string }; Returns: string }
      get_conversation_peer_meta: {
        Args: { p_other_user_id: string }
        Returns: {
          last_seen_at: string
          read_receipts_enabled: boolean
        }[]
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
      get_gym_membership_status: { Args: { p_gym_id: string }; Returns: string }
      get_gym_posts_by_ids: {
        Args: { p_ids: string[] }
        Returns: {
          comments_count: number
          content: string
          created_at: string
          gym_apellido: string
          gym_avatar_url: string
          gym_id: string
          gym_is_verified: boolean
          gym_nombre: string
          gym_username: string
          id: string
          liked_by_me: boolean
          likes_count: number
          location: string
          media: Json
          pinned: boolean
          visibility: string
        }[]
      }
      get_gym_trainer_handle_status: {
        Args: { p_gym_id: string }
        Returns: {
          initiated_by: string
          status: string
        }[]
      }
      get_my_exercises_usage_counts: {
        Args: never
        Returns: {
          exercise_id: string
          users_count: number
        }[]
      }
      get_or_create_conversation: {
        Args: { p_other_user_id: string }
        Returns: string
      }
      get_personalized_feed: {
        Args: { p_limit?: number; p_offset?: number; p_seed?: string }
        Returns: {
          author_id: string
          comments_count: number
          content: string | null
          created_at: string
          id: string
          likes_count: number
          link_description: string | null
          link_image_url: string | null
          link_site_name: string | null
          link_title: string | null
          link_url: string | null
          media_type: string | null
          media_url: string | null
          poll_ends_at: string | null
          poll_multi: boolean
          poll_options: string[] | null
          poll_vote_counts: number[] | null
          quoted_post_id: string | null
          quotes_count: number
          reposts_count: number
          thread_parent_id: string | null
          thread_root_id: string | null
          updated_at: string
          views_count: number
          youtube_video_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "posts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_shared_routine: { Args: { p_token: string }; Returns: Json }
      get_socio_count: { Args: { p_gym_id: string }; Returns: number }
      get_subscriber_count: { Args: { p_user_id: string }; Returns: number }
      get_subscription_status: {
        Args: { p_target_id: string }
        Returns: string
      }
      get_unread_conversation_count: { Args: never; Returns: number }
      invite_gym_trainer: {
        Args: {
          p_duration_months?: number
          p_membership_type: string
          p_trainer_id: string
        }
        Returns: {
          duration_months: number | null
          ended_at: string | null
          expires_at: string | null
          gym_id: string
          id: string
          initiated_by: string
          membership_type: string | null
          requested_at: string
          responded_at: string | null
          status: string
          trainer_id: string
        }
        SetofOptions: {
          from: "*"
          to: "gym_trainers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_active_gym_student_of: {
        Args: { p_student: string; p_trainer: string }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_conversation_admin: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      is_conversation_participant: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      is_profile_public: { Args: { uid: string }; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      leave_group_conversation: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      list_conversations: {
        Args: never
        Returns: {
          conversation_id: string
          group_avatar_url: string
          group_name: string
          is_initiator: boolean
          kind: string
          last_message_at: string
          last_message_preview: string
          last_message_read: boolean
          last_message_sender_is_me: boolean
          last_message_type: string
          other_apellido: string
          other_avatar_url: string
          other_is_verified: boolean
          other_nombre: string
          other_user_id: string
          other_user_type: Database["public"]["Enums"]["user_type"]
          other_username: string
          participants: Json
          status: string
          unread_count: number
        }[]
      }
      list_exercise_users: {
        Args: { p_exercise_id: string }
        Returns: {
          apellido: string
          avatar_url: string
          nombre: string
          user_id: string
          username: string
        }[]
      }
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
          is_verified: boolean
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
          is_verified: boolean
          nombre: string
          user_type: Database["public"]["Enums"]["user_type"]
          username: string
        }[]
      }
      list_gym_classes: {
        Args: { p_gym_id: string }
        Returns: {
          allow_enrollment: boolean
          capacity: number
          description: string
          id: string
          image_url: string
          instructor_apellido: string
          instructor_avatar_url: string
          instructor_id: string
          instructor_nombre: string
          instructor_username: string
          name: string
          sessions: Json
        }[]
      }
      list_gym_members: {
        Args: {
          p_gym_id: string
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_sort?: string
          p_status_filter?: string
        }
        Returns: {
          apellido: string
          avatar_url: string
          duration_months: number
          ended_at: string
          expires_at: string
          id: string
          is_verified: boolean
          member_id: string
          membership_type: string
          nombre: string
          requested_at: string
          responded_at: string
          status: string
          tier: string
          user_type: Database["public"]["Enums"]["user_type"]
          username: string
        }[]
      }
      list_gym_posts_full: {
        Args: { p_gym_id: string }
        Returns: {
          comments_count: number
          content: string
          created_at: string
          cross_posted_rep_id: string
          id: string
          liked_by_me: boolean
          likes_count: number
          location: string
          media: Json
          pinned: boolean
          pinned_at: string
          visibility: string
        }[]
      }
      list_gym_students_for_trainer: {
        Args: {
          p_gym_id?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_trainer_id: string
        }
        Returns: {
          apellido: string
          avatar_url: string
          gym_apellido: string
          gym_id: string
          gym_nombre: string
          gym_username: string
          id: string
          is_verified: boolean
          nombre: string
          since: string
          user_type: Database["public"]["Enums"]["user_type"]
          username: string
        }[]
      }
      list_gym_trainer_ratings: {
        Args: { p_gym_id: string }
        Returns: {
          apellido: string
          avatar_url: string
          avg_rating: number
          is_verified: boolean
          my_comment: string
          my_rating: number
          nombre: string
          rating_count: number
          trainer_id: string
          username: string
        }[]
      }
      list_gym_trainer_reviews: {
        Args: { p_gym_id: string; p_trainer_id: string }
        Returns: {
          apellido: string
          avatar_url: string
          comment: string
          created_at: string
          member_id: string
          nombre: string
          rating: number
          username: string
        }[]
      }
      list_gym_trainers: {
        Args: {
          p_gym_id: string
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_sort?: string
          p_status_filter?: string
        }
        Returns: {
          apellido: string
          avatar_url: string
          duration_months: number
          ended_at: string
          expires_at: string
          id: string
          initiated_by: string
          is_verified: boolean
          membership_type: string
          nombre: string
          requested_at: string
          responded_at: string
          status: string
          tier: string
          trainer_id: string
          user_type: Database["public"]["Enums"]["user_type"]
          username: string
        }[]
      }
      list_historic_subscribers: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_user_id: string
        }
        Returns: {
          apellido: string
          avatar_url: string
          ended_at: string
          id: string
          is_verified: boolean
          nombre: string
          subscribed_at: string
          user_type: Database["public"]["Enums"]["user_type"]
          username: string
        }[]
      }
      list_my_gym_trainer_handles: {
        Args: { p_trainer_id: string }
        Returns: {
          apellido: string
          avatar_url: string
          gym_id: string
          is_verified: boolean
          nombre: string
          username: string
        }[]
      }
      list_subscribers: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_user_id: string
        }
        Returns: {
          apellido: string
          avatar_url: string
          id: string
          is_verified: boolean
          nombre: string
          subscribed_at: string
          user_type: Database["public"]["Enums"]["user_type"]
          username: string
        }[]
      }
      list_trained_exercises: {
        Args: never
        Returns: {
          exercise_id: string
          name: string
        }[]
      }
      mark_conversation_read: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      next_session_occurrence: {
        Args: { p_day_of_week: number; p_end_time: string }
        Returns: string
      }
      open_view_once_message: {
        Args: { p_message_id: string }
        Returns: {
          fully_viewed: boolean
          msg: Database["public"]["Tables"]["messages"]["Row"]
        }[]
      }
      pin_message: {
        Args: { p_conversation_id: string; p_message_id: string }
        Returns: undefined
      }
      react_to_message: {
        Args: { p_emoji: string; p_message_id: string }
        Returns: {
          attachment_duration_seconds: number | null
          attachment_filename: string | null
          attachment_path: string | null
          attachment_type: string | null
          content: string | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          is_forwarded: boolean
          reactions: Json
          read_at: string | null
          reply_to_message_id: string | null
          sender_id: string
          shared_gym_post_id: string | null
          shared_post_id: string | null
          view_once: boolean
          viewed_once_at: string | null
          viewed_once_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_post_view: { Args: { p_post_id: string }; Returns: undefined }
      remove_group_participant: {
        Args: { p_conversation_id: string; p_user_id: string }
        Returns: undefined
      }
      rename_group: {
        Args: { p_conversation_id: string; p_name: string }
        Returns: undefined
      }
      request_gym_membership: {
        Args: { p_gym_id: string }
        Returns: {
          duration_months: number | null
          ended_at: string | null
          expires_at: string | null
          gym_id: string
          id: string
          member_id: string
          membership_type: string | null
          requested_at: string
          responded_at: string | null
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "gym_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_gym_trainer_handle: {
        Args: { p_gym_id: string }
        Returns: {
          duration_months: number | null
          ended_at: string | null
          expires_at: string | null
          gym_id: string
          id: string
          initiated_by: string
          membership_type: string | null
          requested_at: string
          responded_at: string | null
          status: string
          trainer_id: string
        }
        SetofOptions: {
          from: "*"
          to: "gym_trainers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_subscription: {
        Args: { p_trainer_id: string }
        Returns: {
          created_at: string
          ended_at: string | null
          id: string
          responded_at: string | null
          status: string
          subscriber_id: string
          trainer_id: string
        }
        SetofOptions: {
          from: "*"
          to: "subscriptions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      search_profiles: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          apellido: string
          avatar_url: string
          id: string
          is_verified: boolean
          nacionalidad: string
          nombre: string
          score: number
          user_type: Database["public"]["Enums"]["user_type"]
          username: string
        }[]
      }
      send_message:
        | {
            Args: {
              p_attachment_duration_seconds?: number
              p_attachment_filename?: string
              p_attachment_path?: string
              p_attachment_type?: string
              p_content?: string
              p_conversation_id: string
              p_is_forwarded?: boolean
              p_reply_to_message_id?: string
              p_shared_gym_post_id?: string
              p_shared_post_id?: string
            }
            Returns: {
              attachment_duration_seconds: number | null
              attachment_filename: string | null
              attachment_path: string | null
              attachment_type: string | null
              content: string | null
              conversation_id: string
              created_at: string
              deleted_at: string | null
              edited_at: string | null
              id: string
              is_forwarded: boolean
              reactions: Json
              read_at: string | null
              reply_to_message_id: string | null
              sender_id: string
              shared_gym_post_id: string | null
              shared_post_id: string | null
              view_once: boolean
              viewed_once_at: string | null
              viewed_once_by: string | null
            }
            SetofOptions: {
              from: "*"
              to: "messages"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_attachment_duration_seconds?: number
              p_attachment_filename?: string
              p_attachment_path?: string
              p_attachment_type?: string
              p_content?: string
              p_conversation_id: string
              p_is_forwarded?: boolean
              p_reply_to_message_id?: string
              p_shared_gym_post_id?: string
              p_shared_post_id?: string
              p_view_once?: boolean
            }
            Returns: {
              attachment_duration_seconds: number | null
              attachment_filename: string | null
              attachment_path: string | null
              attachment_type: string | null
              content: string | null
              conversation_id: string
              created_at: string
              deleted_at: string | null
              edited_at: string | null
              id: string
              is_forwarded: boolean
              reactions: Json
              read_at: string | null
              reply_to_message_id: string | null
              sender_id: string
              shared_gym_post_id: string | null
              shared_post_id: string | null
              view_once: boolean
              viewed_once_at: string | null
              viewed_once_by: string | null
            }
            SetofOptions: {
              from: "*"
              to: "messages"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      set_group_avatar: {
        Args: { p_avatar_url: string; p_conversation_id: string }
        Returns: undefined
      }
      set_group_participant_role: {
        Args: { p_conversation_id: string; p_role: string; p_user_id: string }
        Returns: undefined
      }
      set_routine_finished: {
        Args: { p_finished: boolean; p_routine_id: string }
        Returns: undefined
      }
      suggested_profiles: {
        Args: { p_limit?: number }
        Returns: {
          apellido: string
          avatar_url: string
          follower_count: number
          id: string
          is_verified: boolean
          nombre: string
          user_type: Database["public"]["Enums"]["user_type"]
          username: string
        }[]
      }
      touch_last_seen: { Args: never; Returns: undefined }
      touch_profile_visit: {
        Args: { p_visited_id: string }
        Returns: undefined
      }
      unpin_message: { Args: { p_conversation_id: string }; Returns: undefined }
      vote_in_poll: {
        Args: { p_option_index: number; p_post_id: string }
        Returns: undefined
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
        | "cuerpo_completo"
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
        "cuerpo_completo",
      ],
      user_type: ["admin", "gimnasio", "entrenador", "usuario", "colaborador"],
      weight_unit: ["kg", "lb", "bloques"],
    },
  },
} as const
