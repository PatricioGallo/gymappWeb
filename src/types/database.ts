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
      messages: {
        Row: {
          attachment_duration_seconds: number | null
          attachment_filename: string | null
          attachment_path: string | null
          attachment_type: string | null
          content: string | null
          conversation_id: string
          created_at: string
          id: string
          is_forwarded: boolean
          reactions: Json
          read_at: string | null
          reply_to_message_id: string | null
          sender_id: string
          shared_post_id: string | null
        }
        Insert: {
          attachment_duration_seconds?: number | null
          attachment_filename?: string | null
          attachment_path?: string | null
          attachment_type?: string | null
          content?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          is_forwarded?: boolean
          reactions?: Json
          read_at?: string | null
          reply_to_message_id?: string | null
          sender_id: string
          shared_post_id?: string | null
        }
        Update: {
          attachment_duration_seconds?: number | null
          attachment_filename?: string | null
          attachment_path?: string | null
          attachment_type?: string | null
          content?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          is_forwarded?: boolean
          reactions?: Json
          read_at?: string | null
          reply_to_message_id?: string | null
          sender_id?: string
          shared_post_id?: string | null
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
            foreignKeyName: "messages_shared_post_id_fkey"
            columns: ["shared_post_id"]
            isOneToOne: false
            referencedRelation: "posts"
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
          apellido: string
          avatar_url: string | null
          bio: string | null
          ciudad: string | null
          created_at: string
          email: string
          fecha_nacimiento: string
          genero: string | null
          id: string
          is_public: boolean
          is_verified: boolean
          last_seen_at: string | null
          links: Json
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
          apellido: string
          avatar_url?: string | null
          bio?: string | null
          ciudad?: string | null
          created_at?: string
          email: string
          fecha_nacimiento: string
          genero?: string | null
          id: string
          is_public?: boolean
          is_verified?: boolean
          last_seen_at?: string | null
          links?: Json
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
          apellido?: string
          avatar_url?: string | null
          bio?: string | null
          ciudad?: string | null
          created_at?: string
          email?: string
          fecha_nacimiento?: string
          genero?: string | null
          id?: string
          is_public?: boolean
          is_verified?: boolean
          last_seen_at?: string | null
          links?: Json
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
          apellido: string | null
          avatar_url: string | null
          bio: string | null
          fecha_nacimiento: string | null
          id: string | null
          is_public: boolean | null
          is_verified: boolean | null
          links: Json | null
          nacionalidad: string | null
          nombre: string | null
          show_stats: boolean | null
          stats_widgets: Json | null
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
          is_verified?: boolean | null
          links?: Json | null
          nacionalidad?: string | null
          nombre?: string | null
          show_stats?: boolean | null
          stats_widgets?: Json | null
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
          is_verified?: boolean | null
          links?: Json | null
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
      get_subscriber_count: { Args: { p_user_id: string }; Returns: number }
      get_subscription_status: {
        Args: { p_target_id: string }
        Returns: string
      }
      get_unread_conversation_count: { Args: never; Returns: number }
      is_admin: { Args: never; Returns: boolean }
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
          id: string
          is_forwarded: boolean
          reactions: Json
          read_at: string | null
          reply_to_message_id: string | null
          sender_id: string
          shared_post_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      remove_group_participant: {
        Args: { p_conversation_id: string; p_user_id: string }
        Returns: undefined
      }
      rename_group: {
        Args: { p_conversation_id: string; p_name: string }
        Returns: undefined
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
      send_message: {
        Args: {
          p_attachment_duration_seconds?: number
          p_attachment_filename?: string
          p_attachment_path?: string
          p_attachment_type?: string
          p_content?: string
          p_conversation_id: string
          p_is_forwarded?: boolean
          p_reply_to_message_id?: string
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
          id: string
          is_forwarded: boolean
          reactions: Json
          read_at: string | null
          reply_to_message_id: string | null
          sender_id: string
          shared_post_id: string | null
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
