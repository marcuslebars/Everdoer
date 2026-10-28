export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12"
  }
  public: {
    Tables: {
      accounting_connections: {
        Row: {
          company_id: string
          connected_at: string
          connected_by: string | null
          created_at: string
          environment: string
          last_error: string | null
          last_sync_at: string | null
          organization_id: string
          provider: string
          remote_name: string | null
          remote_tenant_id: string
          settings: Json
          status: string
          sync_start_date: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          company_id: string
          connected_at?: string
          connected_by?: string | null
          created_at?: string
          environment?: string
          last_error?: string | null
          last_sync_at?: string | null
          organization_id: string
          provider: string
          remote_name?: string | null
          remote_tenant_id: string
          settings?: Json
          status?: string
          sync_start_date?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          connected_at?: string
          connected_by?: string | null
          created_at?: string
          environment?: string
          last_error?: string | null
          last_sync_at?: string | null
          organization_id?: string
          provider?: string
          remote_name?: string | null
          remote_tenant_id?: string
          settings?: Json
          status?: string
          sync_start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_connections_company_id_fkey"
            columns: ["company_id"]
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_connections_connected_by_fkey"
            columns: ["connected_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_connections_connected_by_fkey"
            columns: ["connected_by"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "accounting_connections_connected_by_fkey"
            columns: ["connected_by"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
          {
            foreignKeyName: "accounting_connections_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_links: {
        Row: {
          attached_receipt_path: string | null
          company_id: string
          entity_type: string
          id: string
          local_key: string
          note: string | null
          organization_id: string
          payload_hash: string | null
          provider: string
          remote_id: string
          remote_tenant_id: string
          remote_version: string | null
          synced_at: string
        }
        ComputedFields: never
        Insert: {
          attached_receipt_path?: string | null
          company_id: string
          entity_type: string
          id?: string
          local_key: string
          note?: string | null
          organization_id: string
          payload_hash?: string | null
          provider: string
          remote_id: string
          remote_tenant_id: string
          remote_version?: string | null
          synced_at?: string
        }
        Update: {
          attached_receipt_path?: string | null
          company_id?: string
          entity_type?: string
          id?: string
          local_key?: string
          note?: string | null
          organization_id?: string
          payload_hash?: string | null
          provider?: string
          remote_id?: string
          remote_tenant_id?: string
          remote_version?: string | null
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_links_company_id_fkey"
            columns: ["company_id"]
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_links_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_sync_jobs: {
        Row: {
          attempts: number
          available_at: string
          company_id: string
          created_at: string
          detail: string | null
          done_at: string | null
          entity_id: string
          entity_type: string
          id: string
          last_error: string | null
          locked_at: string | null
          max_attempts: number
          organization_id: string
          status: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          attempts?: number
          available_at?: string
          company_id: string
          created_at?: string
          detail?: string | null
          done_at?: string | null
          entity_id: string
          entity_type: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          max_attempts?: number
          organization_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          available_at?: string
          company_id?: string
          created_at?: string
          detail?: string | null
          done_at?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          max_attempts?: number
          organization_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_sync_jobs_company_id_fkey"
            columns: ["company_id"]
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_sync_jobs_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_tokens: {
        Row: {
          access_expires_at: string
          access_token_enc: string
          company_id: string
          refresh_expires_at: string | null
          refresh_lock_at: string | null
          refresh_token_enc: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          access_expires_at: string
          access_token_enc: string
          company_id: string
          refresh_expires_at?: string | null
          refresh_lock_at?: string | null
          refresh_token_enc: string
          updated_at?: string
        }
        Update: {
          access_expires_at?: string
          access_token_enc?: string
          company_id?: string
          refresh_expires_at?: string | null
          refresh_lock_at?: string | null
          refresh_token_enc?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_tokens_company_id_fkey"
            columns: ["company_id"]
            referencedRelation: "accounting_connections"
            referencedColumns: ["company_id"]
          },
        ]
      }
      activity_events: {
        Row: {
          actor_user_id: string | null
          company_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          event_type: string
          id: string
          metadata_json: Json
          occurred_at: string
          organization_id: string
          related_entity_id: string | null
          related_entity_type: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          actor_user_id?: string | null
          company_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          event_type: string
          id?: string
          metadata_json?: Json
          occurred_at?: string
          organization_id: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          updated_at?: string
        }
        Update: {
          actor_user_id?: string | null
          company_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          event_type?: string
          id?: string
          metadata_json?: Json
          occurred_at?: string
          organization_id?: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_events_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "activity_events_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          cache_read_tokens: number
          cache_write_tokens: number
          channel: string
          company_id: string | null
          created_at: string
          duration_ms: number
          error: string | null
          id: string
          input_tokens: number
          model: string | null
          organization_id: string
          output_tokens: number
          reply: string | null
          rounds: number
          status: string
          tool_calls: Json
          tool_count: number
          trigger_ref: string | null
        }
        ComputedFields: never
        Insert: {
          cache_read_tokens?: number
          cache_write_tokens?: number
          channel: string
          company_id?: string | null
          created_at?: string
          duration_ms?: number
          error?: string | null
          id?: string
          input_tokens?: number
          model?: string | null
          organization_id: string
          output_tokens?: number
          reply?: string | null
          rounds?: number
          status: string
          tool_calls?: Json
          tool_count?: number
          trigger_ref?: string | null
        }
        Update: {
          cache_read_tokens?: number
          cache_write_tokens?: number
          channel?: string
          company_id?: string | null
          created_at?: string
          duration_ms?: number
          error?: string | null
          id?: string
          input_tokens?: number
          model?: string | null
          organization_id?: string
          output_tokens?: number
          reply?: string | null
          rounds?: number
          status?: string
          tool_calls?: Json
          tool_count?: number
          trigger_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_drafts: {
        Row: {
          analysis: Json
          booking_id: string | null
          company_id: string
          contact_id: string
          created_at: string
          created_by: string | null
          email_body: string | null
          email_error: string | null
          email_sent_at: string | null
          email_status: string
          email_subject: string | null
          id: string
          organization_id: string
          proposed_slots: Json
          sms_body: string | null
          sms_error: string | null
          sms_sent_at: string | null
          sms_status: string
          updated_at: string
          workflow_id: string | null
        }
        ComputedFields: never
        Insert: {
          analysis: Json
          booking_id?: string | null
          company_id: string
          contact_id: string
          created_at?: string
          created_by?: string | null
          email_body?: string | null
          email_error?: string | null
          email_sent_at?: string | null
          email_status?: string
          email_subject?: string | null
          id?: string
          organization_id: string
          proposed_slots?: Json
          sms_body?: string | null
          sms_error?: string | null
          sms_sent_at?: string | null
          sms_status?: string
          updated_at?: string
          workflow_id?: string | null
        }
        Update: {
          analysis?: Json
          booking_id?: string | null
          company_id?: string
          contact_id?: string
          created_at?: string
          created_by?: string | null
          email_body?: string | null
          email_error?: string | null
          email_sent_at?: string | null
          email_status?: string
          email_subject?: string | null
          id?: string
          organization_id?: string
          proposed_slots?: Json
          sms_body?: string | null
          sms_error?: string | null
          sms_sent_at?: string | null
          sms_status?: string
          updated_at?: string
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_drafts_booking_id_organization_id_fkey"
            columns: ["booking_id", "organization_id"]
            referencedRelation: "bookings"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "ai_drafts_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "ai_drafts_contact_id_organization_id_fkey"
            columns: ["contact_id", "organization_id"]
            referencedRelation: "contacts"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "ai_drafts_contact_id_organization_id_fkey"
            columns: ["contact_id", "organization_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "ai_drafts_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_drafts_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "ai_drafts_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
          {
            foreignKeyName: "ai_drafts_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_drafts_workflow_id_organization_id_fkey"
            columns: ["workflow_id", "organization_id"]
            referencedRelation: "ui_workflow_list_v"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "ai_drafts_workflow_id_organization_id_fkey"
            columns: ["workflow_id", "organization_id"]
            referencedRelation: "workflows"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      billing_event_jobs: {
        Row: {
          attempt_count: number
          available_at: string
          billing_event_id: string
          completed_at: string | null
          created_at: string
          id: string
          last_attempted_at: string | null
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          started_at: string | null
          status: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          attempt_count?: number
          available_at?: string
          billing_event_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          last_attempted_at?: string | null
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          available_at?: string
          billing_event_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          last_attempted_at?: string | null
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_event_jobs_billing_event_id_fkey"
            columns: ["billing_event_id"]
            referencedRelation: "billing_events"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_events: {
        Row: {
          id: string
          organization_id: string | null
          payload: Json
          processed_at: string | null
          received_at: string
          stripe_event_id: string
          type: string
        }
        ComputedFields: never
        Insert: {
          id?: string
          organization_id?: string | null
          payload: Json
          processed_at?: string | null
          received_at?: string
          stripe_event_id: string
          type: string
        }
        Update: {
          id?: string
          organization_id?: string | null
          payload?: Json
          processed_at?: string | null
          received_at?: string
          stripe_event_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_events_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_assignments: {
        Row: {
          assigned_by: string | null
          booking_id: string
          created_at: string
          id: string
          notified_at: string | null
          organization_id: string
          profile_id: string
        }
        ComputedFields: never
        Insert: {
          assigned_by?: string | null
          booking_id: string
          created_at?: string
          id?: string
          notified_at?: string | null
          organization_id: string
          profile_id: string
        }
        Update: {
          assigned_by?: string | null
          booking_id?: string
          created_at?: string
          id?: string
          notified_at?: string | null
          organization_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "booking_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
          {
            foreignKeyName: "booking_assignments_booking_id_fkey"
            columns: ["booking_id"]
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_assignments_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_assignments_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_assignments_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "booking_assignments_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
        ]
      }
      booking_checklist_items: {
        Row: {
          booking_id: string
          created_at: string
          created_by: string | null
          done_at: string | null
          done_by: string | null
          id: string
          label: string
          organization_id: string
          position: number
        }
        ComputedFields: never
        Insert: {
          booking_id: string
          created_at?: string
          created_by?: string | null
          done_at?: string | null
          done_by?: string | null
          id?: string
          label: string
          organization_id: string
          position?: number
        }
        Update: {
          booking_id?: string
          created_at?: string
          created_by?: string | null
          done_at?: string | null
          done_by?: string | null
          id?: string
          label?: string
          organization_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "booking_checklist_items_booking_id_fkey"
            columns: ["booking_id"]
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_checklist_items_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_checklist_items_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "booking_checklist_items_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
          {
            foreignKeyName: "booking_checklist_items_done_by_fkey"
            columns: ["done_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_checklist_items_done_by_fkey"
            columns: ["done_by"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "booking_checklist_items_done_by_fkey"
            columns: ["done_by"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
          {
            foreignKeyName: "booking_checklist_items_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          company_id: string
          completed_at: string | null
          completed_by: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          customer_confirmed_at: string | null
          deposit_cents: number | null
          deposit_invoice_id: string | null
          deposit_paid_at: string | null
          description: string | null
          duration_minutes: number
          en_route_at: string | null
          hold_expires_at: string | null
          id: string
          location: string | null
          manage_token: string | null
          occurrence_date: string | null
          organization_id: string
          price_cents: number | null
          quote_id: string | null
          recurrence_exception: boolean
          recurring_job_id: string | null
          scheduled_for: string
          service_item_id: string | null
          source: string | null
          source_call_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["booking_status"]
          title: string
          updated_at: string
          window_key: string | null
        }
        ComputedFields: never
        Insert: {
          company_id: string
          completed_at?: string | null
          completed_by?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_confirmed_at?: string | null
          deposit_cents?: number | null
          deposit_invoice_id?: string | null
          deposit_paid_at?: string | null
          description?: string | null
          duration_minutes?: number
          en_route_at?: string | null
          hold_expires_at?: string | null
          id?: string
          location?: string | null
          manage_token?: string | null
          occurrence_date?: string | null
          organization_id: string
          price_cents?: number | null
          quote_id?: string | null
          recurrence_exception?: boolean
          recurring_job_id?: string | null
          scheduled_for: string
          service_item_id?: string | null
          source?: string | null
          source_call_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          title: string
          updated_at?: string
          window_key?: string | null
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          completed_by?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_confirmed_at?: string | null
          deposit_cents?: number | null
          deposit_invoice_id?: string | null
          deposit_paid_at?: string | null
          description?: string | null
          duration_minutes?: number
          en_route_at?: string | null
          hold_expires_at?: string | null
          id?: string
          location?: string | null
          manage_token?: string | null
          occurrence_date?: string | null
          organization_id?: string
          price_cents?: number | null
          quote_id?: string | null
          recurrence_exception?: boolean
          recurring_job_id?: string | null
          scheduled_for?: string
          service_item_id?: string | null
          source?: string | null
          source_call_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          title?: string
          updated_at?: string
          window_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "bookings_completed_by_fkey"
            columns: ["completed_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_completed_by_fkey"
            columns: ["completed_by"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "bookings_completed_by_fkey"
            columns: ["completed_by"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
          {
            foreignKeyName: "bookings_contact_id_organization_id_fkey"
            columns: ["contact_id", "organization_id"]
            referencedRelation: "contacts"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "bookings_contact_id_organization_id_fkey"
            columns: ["contact_id", "organization_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "bookings_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "bookings_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
          {
            foreignKeyName: "bookings_deposit_invoice_id_fkey"
            columns: ["deposit_invoice_id"]
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_quote_id_fkey"
            columns: ["quote_id"]
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_recurring_job_id_fkey"
            columns: ["recurring_job_id"]
            referencedRelation: "recurring_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_service_item_id_fkey"
            columns: ["service_item_id"]
            referencedRelation: "service_catalog_items"
            referencedColumns: ["id"]
          },
        ]
      }
      business_line_calls: {
        Row: {
          accepted_at: string | null
          business_line: string
          call_sid: string
          company_id: string
          created_at: string
          id: string
          organization_id: string
          outcome: string | null
          rang: string[]
          screen: boolean
        }
        ComputedFields: never
        Insert: {
          accepted_at?: string | null
          business_line: string
          call_sid: string
          company_id: string
          created_at?: string
          id?: string
          organization_id: string
          outcome?: string | null
          rang?: string[]
          screen?: boolean
        }
        Update: {
          accepted_at?: string | null
          business_line?: string
          call_sid?: string
          company_id?: string
          created_at?: string
          id?: string
          organization_id?: string
          outcome?: string | null
          rang?: string[]
          screen?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "business_line_calls_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "business_line_calls_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      call_answering_notices: {
        Row: {
          company_id: string
          created_at: string
          id: string
          kind: string
          month: string
          organization_id: string
          sent_at: string | null
        }
        ComputedFields: never
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          kind: string
          month: string
          organization_id: string
          sent_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          kind?: string
          month?: string
          organization_id?: string
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_answering_notices_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "call_answering_notices_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      care_case_bookings: {
        Row: {
          booking_id: string
          case_id: string
          company_id: string
          created_at: string
          id: string
          kind: string
          organization_id: string
        }
        ComputedFields: never
        Insert: {
          booking_id: string
          case_id: string
          company_id: string
          created_at?: string
          id?: string
          kind: string
          organization_id: string
        }
        Update: {
          booking_id?: string
          case_id?: string
          company_id?: string
          created_at?: string
          id?: string
          kind?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_case_bookings_booking_id_fkey"
            columns: ["booking_id"]
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_case_bookings_case_id_fkey"
            columns: ["case_id"]
            referencedRelation: "care_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_case_bookings_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "care_case_bookings_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      care_cases: {
        Row: {
          approval_ids: string[]
          booking_id: string | null
          checkin_id: string | null
          company_id: string
          contact_id: string | null
          created_at: string
          equipment_id: string | null
          followup: string | null
          followup_decided_at: string | null
          id: string
          job_label: string | null
          kind: string
          notes: string | null
          offered_at: string | null
          offered_slots: Json
          opened_via: string
          organization_id: string
          owner_alert_body: string | null
          owner_alert_status: string | null
          owner_alerted_at: string | null
          rating: number | null
          resolved_at: string | null
          status: string
          summary: string | null
          updated_at: string
          visit_kind: string | null
          visit_stage: string | null
          warranty_id: string | null
        }
        ComputedFields: never
        Insert: {
          approval_ids?: string[]
          booking_id?: string | null
          checkin_id?: string | null
          company_id: string
          contact_id?: string | null
          created_at?: string
          equipment_id?: string | null
          followup?: string | null
          followup_decided_at?: string | null
          id?: string
          job_label?: string | null
          kind: string
          notes?: string | null
          offered_at?: string | null
          offered_slots?: Json
          opened_via: string
          organization_id: string
          owner_alert_body?: string | null
          owner_alert_status?: string | null
          owner_alerted_at?: string | null
          rating?: number | null
          resolved_at?: string | null
          status?: string
          summary?: string | null
          updated_at?: string
          visit_kind?: string | null
          visit_stage?: string | null
          warranty_id?: string | null
        }
        Update: {
          approval_ids?: string[]
          booking_id?: string | null
          checkin_id?: string | null
          company_id?: string
          contact_id?: string | null
          created_at?: string
          equipment_id?: string | null
          followup?: string | null
          followup_decided_at?: string | null
          id?: string
          job_label?: string | null
          kind?: string
          notes?: string | null
          offered_at?: string | null
          offered_slots?: Json
          opened_via?: string
          organization_id?: string
          owner_alert_body?: string | null
          owner_alert_status?: string | null
          owner_alerted_at?: string | null
          rating?: number | null
          resolved_at?: string | null
          status?: string
          summary?: string | null
          updated_at?: string
          visit_kind?: string | null
          visit_stage?: string | null
          warranty_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "care_cases_booking_id_fkey"
            columns: ["booking_id"]
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_cases_checkin_id_fkey"
            columns: ["checkin_id"]
            referencedRelation: "care_checkins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_cases_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "care_cases_contact_id_fkey"
            columns: ["contact_id"]
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_cases_contact_id_fkey"
            columns: ["contact_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_cases_equipment_id_fkey"
            columns: ["equipment_id"]
            referencedRelation: "installed_equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_cases_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_cases_warranty_id_fkey"
            columns: ["warranty_id"]
            referencedRelation: "job_warranties"
            referencedColumns: ["id"]
          },
        ]
      }
      care_checkin_claims: {
        Row: {
          checkin_id: string | null
          company_id: string
          contact_id: string
          created_at: string
          id: string
          local_date: string
          organization_id: string
        }
        ComputedFields: never
        Insert: {
          checkin_id?: string | null
          company_id: string
          contact_id: string
          created_at?: string
          id?: string
          local_date: string
          organization_id: string
        }
        Update: {
          checkin_id?: string | null
          company_id?: string
          contact_id?: string
          created_at?: string
          id?: string
          local_date?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_checkin_claims_checkin_id_fkey"
            columns: ["checkin_id"]
            referencedRelation: "care_checkins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_checkin_claims_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "care_checkin_claims_contact_id_fkey"
            columns: ["contact_id"]
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_checkin_claims_contact_id_fkey"
            columns: ["contact_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_checkin_claims_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      care_checkins: {
        Row: {
          answered_at: string | null
          body: string | null
          booking_id: string
          comment: string | null
          company_id: string
          contact_id: string | null
          created_at: string
          id: string
          job_label: string | null
          organization_id: string
          pushes: number
          rating: number | null
          reason: string | null
          send_at: string
          sent_at: string | null
          status: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          answered_at?: string | null
          body?: string | null
          booking_id: string
          comment?: string | null
          company_id: string
          contact_id?: string | null
          created_at?: string
          id?: string
          job_label?: string | null
          organization_id: string
          pushes?: number
          rating?: number | null
          reason?: string | null
          send_at: string
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          answered_at?: string | null
          body?: string | null
          booking_id?: string
          comment?: string | null
          company_id?: string
          contact_id?: string | null
          created_at?: string
          id?: string
          job_label?: string | null
          organization_id?: string
          pushes?: number
          rating?: number | null
          reason?: string | null
          send_at?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_checkins_booking_id_fkey"
            columns: ["booking_id"]
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_checkins_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "care_checkins_contact_id_fkey"
            columns: ["contact_id"]
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_checkins_contact_id_fkey"
            columns: ["contact_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_checkins_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      care_messages: {
        Row: {
          attempts: number
          body: string
          case_id: string | null
          company_id: string
          contact_id: string | null
          created_at: string
          dedupe_key: string
          error: string | null
          id: string
          kind: string
          not_before: string
          organization_id: string
          sent_at: string | null
          status: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          attempts?: number
          body: string
          case_id?: string | null
          company_id: string
          contact_id?: string | null
          created_at?: string
          dedupe_key: string
          error?: string | null
          id?: string
          kind: string
          not_before?: string
          organization_id: string
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          body?: string
          case_id?: string | null
          company_id?: string
          contact_id?: string | null
          created_at?: string
          dedupe_key?: string
          error?: string | null
          id?: string
          kind?: string
          not_before?: string
          organization_id?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_messages_case_id_fkey"
            columns: ["case_id"]
            referencedRelation: "care_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_messages_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "care_messages_contact_id_fkey"
            columns: ["contact_id"]
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_messages_contact_id_fkey"
            columns: ["contact_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_messages_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_templates: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          items: Json
          name: string
          organization_id: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          items?: Json
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          items?: Json
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_templates_company_id_fkey"
            columns: ["company_id"]
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_templates_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_templates_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "checklist_templates_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
          {
            foreignKeyName: "checklist_templates_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          author_profile_id: string | null
          body: string
          company_id: string | null
          created_at: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["comment_entity_type"]
          id: string
          organization_id: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          author_profile_id?: string | null
          body: string
          company_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["comment_entity_type"]
          id?: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          author_profile_id?: string | null
          body?: string
          company_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["comment_entity_type"]
          id?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_author_profile_id_fkey"
            columns: ["author_profile_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_author_profile_id_fkey"
            columns: ["author_profile_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "comments_author_profile_id_fkey"
            columns: ["author_profile_id"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
          {
            foreignKeyName: "comments_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "comments_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          ai_settings: Json
          booking_policy: Json | null
          brand_accent_color: string | null
          brand_from_name: string | null
          brand_logo_url: string | null
          brand_primary_color: string | null
          brand_reply_email: string | null
          brand_reply_phone: string | null
          brand_review_url: string | null
          brand_website_url: string | null
          business_address: string | null
          business_phone_carrier: string | null
          business_phone_kind: string | null
          cancellation_policy_text: string | null
          created_at: string
          created_by: string | null
          digest: Json | null
          email_from_address: string | null
          google_place_id: string | null
          google_rating: number | null
          google_review_count: number | null
          hours: Json | null
          id: string
          industry_pack: Json | null
          invoice_settings: Json
          latitude: number | null
          location_checked_at: string | null
          location_source: string | null
          longitude: number | null
          monthly_scorecard: Json | null
          name: string
          notes: string | null
          online_booking_settings: Json
          organization_id: string
          owner_email: string | null
          owner_phone_e164: string | null
          owner_phone_verified_at: string | null
          profile: Json
          quote_deposit_flat_cents: number | null
          quote_public_base_url: string | null
          quote_terms_text: string | null
          review_settings: Json
          service_area: string | null
          slug: string
          stage: Database["public"]["Enums"]["company_stage"]
          stripe_account_label: string | null
          stripe_acss_debit_enabled: boolean
          stripe_charges_enabled: boolean
          stripe_connect_updated_at: string | null
          stripe_connected_account_id: string | null
          stripe_details_submitted: boolean
          stripe_mode: string | null
          stripe_payouts_enabled: boolean
          stripe_requirements: Json | null
          stripe_statement_descriptor_suffix: string | null
          tax_registration_number: string | null
          timezone: string | null
          updated_at: string
          visit_settings: Json
          website: string | null
        }
        ComputedFields: never
        Insert: {
          ai_settings?: Json
          booking_policy?: Json | null
          brand_accent_color?: string | null
          brand_from_name?: string | null
          brand_logo_url?: string | null
          brand_primary_color?: string | null
          brand_reply_email?: string | null
          brand_reply_phone?: string | null
          brand_review_url?: string | null
          brand_website_url?: string | null
          business_address?: string | null
          business_phone_carrier?: string | null
          business_phone_kind?: string | null
          cancellation_policy_text?: string | null
          created_at?: string
          created_by?: string | null
          digest?: Json | null
          email_from_address?: string | null
          google_place_id?: string | null
          google_rating?: number | null
          google_review_count?: number | null
          hours?: Json | null
          id?: string
          industry_pack?: Json | null
          invoice_settings?: Json
          latitude?: number | null
          location_checked_at?: string | null
          location_source?: string | null
          longitude?: number | null
          monthly_scorecard?: Json | null
          name: string
          notes?: string | null
          online_booking_settings?: Json
          organization_id: string
          owner_email?: string | null
          owner_phone_e164?: string | null
          owner_phone_verified_at?: string | null
          profile?: Json
          quote_deposit_flat_cents?: number | null
          quote_public_base_url?: string | null
          quote_terms_text?: string | null
          review_settings?: Json
          service_area?: string | null
          slug: string
          stage?: Database["public"]["Enums"]["company_stage"]
          stripe_account_label?: string | null
          stripe_acss_debit_enabled?: boolean
          stripe_charges_enabled?: boolean
          stripe_connect_updated_at?: string | null
          stripe_connected_account_id?: string | null
          stripe_details_submitted?: boolean
          stripe_mode?: string | null
          stripe_payouts_enabled?: boolean
          stripe_requirements?: Json | null
          stripe_statement_descriptor_suffix?: string | null
          tax_registration_number?: string | null
          timezone?: string | null
          updated_at?: string
          visit_settings?: Json
          website?: string | null
        }
        Update: {
          ai_settings?: Json
          booking_policy?: Json | null
          brand_accent_color?: string | null
          brand_from_name?: string | null
          brand_logo_url?: string | null
          brand_primary_color?: string | null
          brand_reply_email?: string | null
          brand_reply_phone?: string | null
          brand_review_url?: string | null
          brand_website_url?: string | null
          business_address?: string | null
          business_phone_carrier?: string | null
          business_phone_kind?: string | null
          cancellation_policy_text?: string | null
          created_at?: string
          created_by?: string | null
          digest?: Json | null
          email_from_address?: string | null
          google_place_id?: string | null
          google_rating?: number | null
          google_review_count?: number | null
          hours?: Json | null
          id?: string
          industry_pack?: Json | null
          invoice_settings?: Json
          latitude?: number | null
          location_checked_at?: string | null
          location_source?: string | null
          longitude?: number | null
          monthly_scorecard?: Json | null
          name?: string
          notes?: string | null
          online_booking_settings?: Json
          organization_id?: string
          owner_email?: string | null
          owner_phone_e164?: string | null
          owner_phone_verified_at?: string | null
          profile?: Json
          quote_deposit_flat_cents?: number | null
          quote_public_base_url?: string | null
          quote_terms_text?: string | null
          review_settings?: Json
          service_area?: string | null
          slug?: string
          stage?: Database["public"]["Enums"]["company_stage"]
          stripe_account_label?: string | null
          stripe_acss_debit_enabled?: boolean
          stripe_charges_enabled?: boolean
          stripe_connect_updated_at?: string | null
          stripe_connected_account_id?: string | null
          stripe_details_submitted?: boolean
          stripe_mode?: string | null
          stripe_payouts_enabled?: boolean
          stripe_requirements?: Json | null
          stripe_statement_descriptor_suffix?: string | null
          tax_registration_number?: string | null
          timezone?: string | null
          updated_at?: string
          visit_settings?: Json
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "companies_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
          {
            foreignKeyName: "companies_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      company_memberships: {
        Row: {
          company_id: string
          created_at: string
          id: string
          organization_id: string
          profile_id: string
          role: Database["public"]["Enums"]["company_role"]
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          organization_id: string
          profile_id: string
          role?: Database["public"]["Enums"]["company_role"]
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          organization_id?: string
          profile_id?: string
          role?: Database["public"]["Enums"]["company_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_memberships_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "company_memberships_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_memberships_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_memberships_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "company_memberships_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
        ]
      }
      company_sites: {
        Row: {
          company_id: string
          content: Json
          created_at: string
          generated_at: string | null
          id: string
          mode: string
          organization_id: string
          owner_notified_at: string | null
          published_at: string | null
          slug: string
          status: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          company_id: string
          content?: Json
          created_at?: string
          generated_at?: string | null
          id?: string
          mode?: string
          organization_id: string
          owner_notified_at?: string | null
          published_at?: string | null
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          content?: Json
          created_at?: string
          generated_at?: string | null
          id?: string
          mode?: string
          organization_id?: string
          owner_notified_at?: string | null
          published_at?: string | null
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_sites_company_id_fkey"
            columns: ["company_id"]
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_sites_company_org_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "company_sites_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      company_stripe_customers: {
        Row: {
          company_id: string
          contact_id: string
          created_at: string
          organization_id: string
          stripe_customer_id: string
        }
        ComputedFields: never
        Insert: {
          company_id: string
          contact_id: string
          created_at?: string
          organization_id: string
          stripe_customer_id: string
        }
        Update: {
          company_id?: string
          contact_id?: string
          created_at?: string
          organization_id?: string
          stripe_customer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_stripe_customers_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "company_stripe_customers_contact_id_organization_id_fkey"
            columns: ["contact_id", "organization_id"]
            referencedRelation: "contacts"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "company_stripe_customers_contact_id_organization_id_fkey"
            columns: ["contact_id", "organization_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "company_stripe_customers_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      company_voice_profiles: {
        Row: {
          active: boolean
          brand_label: string | null
          company_id: string
          created_at: string
          created_by: string | null
          dynamic_variables: Json
          from_number: string | null
          id: string
          organization_id: string
          retell_outbound_agent_id: string | null
          system_prompt: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          active?: boolean
          brand_label?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          dynamic_variables?: Json
          from_number?: string | null
          id?: string
          organization_id: string
          retell_outbound_agent_id?: string | null
          system_prompt?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          brand_label?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          dynamic_variables?: Json
          from_number?: string | null
          id?: string
          organization_id?: string
          retell_outbound_agent_id?: string | null
          system_prompt?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_voice_profiles_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "company_voice_profiles_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_voice_profiles_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "company_voice_profiles_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
          {
            foreignKeyName: "company_voice_profiles_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_documents: {
        Row: {
          ai_read: Json | null
          company_id: string
          created_at: string
          expires_on: string | null
          extra_file_paths: string[]
          file_content_type: string | null
          file_path: string | null
          holder_name: string | null
          holder_type: string | null
          id: string
          intake_reply: string | null
          issued_on: string | null
          issuer: string | null
          kind: string
          notes: string | null
          number: string | null
          organization_id: string
          owner_notified_at: string | null
          profile_id: string | null
          reminded_0_at: string | null
          reminded_30_at: string | null
          reminded_7_at: string | null
          replaced_by: string | null
          source_key: string | null
          status: string
          subcontractor_id: string | null
          title: string | null
          updated_at: string
          upload_request_id: string | null
          uploaded_by: string | null
          uploaded_via: string
        }
        ComputedFields: never
        Insert: {
          ai_read?: Json | null
          company_id: string
          created_at?: string
          expires_on?: string | null
          extra_file_paths?: string[]
          file_content_type?: string | null
          file_path?: string | null
          holder_name?: string | null
          holder_type?: string | null
          id?: string
          intake_reply?: string | null
          issued_on?: string | null
          issuer?: string | null
          kind?: string
          notes?: string | null
          number?: string | null
          organization_id: string
          owner_notified_at?: string | null
          profile_id?: string | null
          reminded_0_at?: string | null
          reminded_30_at?: string | null
          reminded_7_at?: string | null
          replaced_by?: string | null
          source_key?: string | null
          status?: string
          subcontractor_id?: string | null
          title?: string | null
          updated_at?: string
          upload_request_id?: string | null
          uploaded_by?: string | null
          uploaded_via: string
        }
        Update: {
          ai_read?: Json | null
          company_id?: string
          created_at?: string
          expires_on?: string | null
          extra_file_paths?: string[]
          file_content_type?: string | null
          file_path?: string | null
          holder_name?: string | null
          holder_type?: string | null
          id?: string
          intake_reply?: string | null
          issued_on?: string | null
          issuer?: string | null
          kind?: string
          notes?: string | null
          number?: string | null
          organization_id?: string
          owner_notified_at?: string | null
          profile_id?: string | null
          reminded_0_at?: string | null
          reminded_30_at?: string | null
          reminded_7_at?: string | null
          replaced_by?: string | null
          source_key?: string | null
          status?: string
          subcontractor_id?: string | null
          title?: string | null
          updated_at?: string
          upload_request_id?: string | null
          uploaded_by?: string | null
          uploaded_via?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_documents_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "compliance_documents_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_documents_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_documents_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "compliance_documents_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
          {
            foreignKeyName: "compliance_documents_replaced_by_fkey"
            columns: ["replaced_by"]
            referencedRelation: "compliance_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_documents_subcontractor_id_fkey"
            columns: ["subcontractor_id"]
            referencedRelation: "subcontractors"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_events: {
        Row: {
          actor: string | null
          company_id: string
          created_at: string
          detail: Json | null
          document_id: string | null
          event: string
          id: string
          ip: string | null
          organization_id: string
          request_id: string | null
          share_id: string | null
          user_agent: string | null
        }
        ComputedFields: never
        Insert: {
          actor?: string | null
          company_id: string
          created_at?: string
          detail?: Json | null
          document_id?: string | null
          event: string
          id?: string
          ip?: string | null
          organization_id: string
          request_id?: string | null
          share_id?: string | null
          user_agent?: string | null
        }
        Update: {
          actor?: string | null
          company_id?: string
          created_at?: string
          detail?: Json | null
          document_id?: string | null
          event?: string
          id?: string
          ip?: string | null
          organization_id?: string
          request_id?: string | null
          share_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compliance_events_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "compliance_events_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_shares: {
        Row: {
          approval_id: string | null
          body: string | null
          company_id: string
          contact_id: string | null
          created_at: string
          document_id: string
          expires_at: string
          id: string
          last_error: string | null
          last_opened_at: string | null
          open_count: number
          organization_id: string
          revoked_at: string | null
          revoked_by: string | null
          send_after: string | null
          sent_at: string | null
          status: string
          token: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          approval_id?: string | null
          body?: string | null
          company_id: string
          contact_id?: string | null
          created_at?: string
          document_id: string
          expires_at: string
          id?: string
          last_error?: string | null
          last_opened_at?: string | null
          open_count?: number
          organization_id: string
          revoked_at?: string | null
          revoked_by?: string | null
          send_after?: string | null
          sent_at?: string | null
          status?: string
          token: string
          updated_at?: string
        }
        Update: {
          approval_id?: string | null
          body?: string | null
          company_id?: string
          contact_id?: string | null
          created_at?: string
          document_id?: string
          expires_at?: string
          id?: string
          last_error?: string | null
          last_opened_at?: string | null
          open_count?: number
          organization_id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          send_after?: string | null
          sent_at?: string | null
          status?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_shares_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "compliance_shares_contact_id_fkey"
            columns: ["contact_id"]
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_shares_contact_id_fkey"
            columns: ["contact_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_shares_document_id_fkey"
            columns: ["document_id"]
            referencedRelation: "compliance_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_shares_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_upload_requests: {
        Row: {
          approval_id: string | null
          body: string | null
          channel: string
          company_id: string
          created_at: string
          document_id: string | null
          expires_at: string
          id: string
          kinds: string[]
          last_error: string | null
          last_upload_at: string | null
          organization_id: string
          send_after: string | null
          sent_at: string | null
          status: string
          subcontractor_id: string
          token: string
          updated_at: string
          uploads: number
        }
        ComputedFields: never
        Insert: {
          approval_id?: string | null
          body?: string | null
          channel?: string
          company_id: string
          created_at?: string
          document_id?: string | null
          expires_at: string
          id?: string
          kinds?: string[]
          last_error?: string | null
          last_upload_at?: string | null
          organization_id: string
          send_after?: string | null
          sent_at?: string | null
          status?: string
          subcontractor_id: string
          token: string
          updated_at?: string
          uploads?: number
        }
        Update: {
          approval_id?: string | null
          body?: string | null
          channel?: string
          company_id?: string
          created_at?: string
          document_id?: string | null
          expires_at?: string
          id?: string
          kinds?: string[]
          last_error?: string | null
          last_upload_at?: string | null
          organization_id?: string
          send_after?: string | null
          sent_at?: string | null
          status?: string
          subcontractor_id?: string
          token?: string
          updated_at?: string
          uploads?: number
        }
        Relationships: [
          {
            foreignKeyName: "compliance_upload_requests_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "compliance_upload_requests_document_id_fkey"
            columns: ["document_id"]
            referencedRelation: "compliance_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_upload_requests_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_upload_requests_subcontractor_id_fkey"
            columns: ["subcontractor_id"]
            referencedRelation: "subcontractors"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_uploads: {
        Row: {
          company_id: string
          created_at: string
          organization_id: string
          path: string
        }
        ComputedFields: never
        Insert: {
          company_id: string
          created_at?: string
          organization_id: string
          path: string
        }
        Update: {
          company_id?: string
          created_at?: string
          organization_id?: string
          path?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_uploads_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "compliance_uploads_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_read_state: {
        Row: {
          contact_id: string
          last_read_at: string
          organization_id: string
          profile_id: string
        }
        ComputedFields: never
        Insert: {
          contact_id: string
          last_read_at?: string
          organization_id: string
          profile_id: string
        }
        Update: {
          contact_id?: string
          last_read_at?: string
          organization_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_read_state_contact_id_fkey"
            columns: ["contact_id"]
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_read_state_contact_id_fkey"
            columns: ["contact_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_read_state_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_read_state_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_read_state_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "contact_read_state_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
        ]
      }
      contacts: {
        Row: {
          company_id: string
          consent_source: string | null
          created_at: string
          customer_account_id: string | null
          email: string | null
          email_opt_out_at: string | null
          first_name: string
          id: string
          last_name: string | null
          metadata: Json
          notes: string | null
          organization_id: string
          owner_profile_id: string | null
          phone: string | null
          phone_last10: string | null
          search_text: string | null
          sms_consent_at: string | null
          sms_opt_out_at: string | null
          stage: Database["public"]["Enums"]["contact_stage"]
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          company_id: string
          consent_source?: string | null
          created_at?: string
          customer_account_id?: string | null
          email?: string | null
          email_opt_out_at?: string | null
          first_name: string
          id?: string
          last_name?: string | null
          metadata?: Json
          notes?: string | null
          organization_id: string
          owner_profile_id?: string | null
          phone?: string | null
          phone_last10?: never
          search_text?: never
          sms_consent_at?: string | null
          sms_opt_out_at?: string | null
          stage?: Database["public"]["Enums"]["contact_stage"]
          updated_at?: string
        }
        Update: {
          company_id?: string
          consent_source?: string | null
          created_at?: string
          customer_account_id?: string | null
          email?: string | null
          email_opt_out_at?: string | null
          first_name?: string
          id?: string
          last_name?: string | null
          metadata?: Json
          notes?: string | null
          organization_id?: string
          owner_profile_id?: string | null
          phone?: string | null
          phone_last10?: never
          search_text?: never
          sms_consent_at?: string | null
          sms_opt_out_at?: string | null
          stage?: Database["public"]["Enums"]["contact_stage"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "contacts_customer_account_fk"
            columns: ["customer_account_id", "organization_id"]
            referencedRelation: "customer_accounts"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "contacts_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "contacts_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
        ]
      }
      crankleads_purchases: {
        Row: {
          business_name: string
          business_type: string
          company_id: string | null
          created_at: string
          existing_user: boolean | null
          failed_at: string | null
          founding: boolean
          id: string
          last_error: string | null
          live_at: string | null
          operator_notified_at: string | null
          organization_id: string | null
          owner_email: string
          owner_name: string
          owner_phone: string
          owner_profile_id: string | null
          paid_at: string | null
          provision_attempts: number
          provisioned_at: string | null
          provisioning_started_at: string | null
          setup_followups_exempt_at: string | null
          setup_reminders_stop_token: string | null
          setup_reminders_stopped_at: string | null
          status: string
          stripe_checkout_session_id: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tier: string
          updated_at: string
          utm: Json
          welcome_email_error: string | null
          welcome_email_sent_at: string | null
        }
        ComputedFields: never
        Insert: {
          business_name: string
          business_type: string
          company_id?: string | null
          created_at?: string
          existing_user?: boolean | null
          failed_at?: string | null
          founding?: boolean
          id?: string
          last_error?: string | null
          live_at?: string | null
          operator_notified_at?: string | null
          organization_id?: string | null
          owner_email: string
          owner_name: string
          owner_phone: string
          owner_profile_id?: string | null
          paid_at?: string | null
          provision_attempts?: number
          provisioned_at?: string | null
          provisioning_started_at?: string | null
          setup_followups_exempt_at?: string | null
          setup_reminders_stop_token?: string | null
          setup_reminders_stopped_at?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier: string
          updated_at?: string
          utm?: Json
          welcome_email_error?: string | null
          welcome_email_sent_at?: string | null
        }
        Update: {
          business_name?: string
          business_type?: string
          company_id?: string | null
          created_at?: string
          existing_user?: boolean | null
          failed_at?: string | null
          founding?: boolean
          id?: string
          last_error?: string | null
          live_at?: string | null
          operator_notified_at?: string | null
          organization_id?: string | null
          owner_email?: string
          owner_name?: string
          owner_phone?: string
          owner_profile_id?: string | null
          paid_at?: string | null
          provision_attempts?: number
          provisioned_at?: string | null
          provisioning_started_at?: string | null
          setup_followups_exempt_at?: string | null
          setup_reminders_stop_token?: string | null
          setup_reminders_stopped_at?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: string
          updated_at?: string
          utm?: Json
          welcome_email_error?: string | null
          welcome_email_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crankleads_purchases_company_id_fkey"
            columns: ["company_id"]
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crankleads_purchases_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crankleads_purchases_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crankleads_purchases_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "crankleads_purchases_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
        ]
      }
      crankleads_setup_followups: {
        Row: {
          company_id: string
          created_at: string
          detail: Json
          email_status: string | null
          id: string
          local_date: string
          next_step: string | null
          operator_status: string | null
          organization_id: string
          purchase_id: string
          sms_status: string | null
          stage: string
          steps_left: number | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          company_id: string
          created_at?: string
          detail?: Json
          email_status?: string | null
          id?: string
          local_date: string
          next_step?: string | null
          operator_status?: string | null
          organization_id: string
          purchase_id: string
          sms_status?: string | null
          stage: string
          steps_left?: number | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          detail?: Json
          email_status?: string | null
          id?: string
          local_date?: string
          next_step?: string | null
          operator_status?: string | null
          organization_id?: string
          purchase_id?: string
          sms_status?: string | null
          stage?: string
          steps_left?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crankleads_setup_followups_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "crankleads_setup_followups_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crankleads_setup_followups_purchase_id_fkey"
            columns: ["purchase_id"]
            referencedRelation: "crankleads_purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_accounts: {
        Row: {
          archived_at: string | null
          billing_address: string | null
          billing_email: string | null
          billing_phone: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          notes: string | null
          organization_id: string
          payment_terms_days: number | null
          tax_number: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          archived_at?: string | null
          billing_address?: string | null
          billing_email?: string | null
          billing_phone?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          notes?: string | null
          organization_id: string
          payment_terms_days?: number | null
          tax_number?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          billing_address?: string | null
          billing_email?: string | null
          billing_phone?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string
          payment_terms_days?: number | null
          tax_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_accounts_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_accounts_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "customer_accounts_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
          {
            foreignKeyName: "customer_accounts_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_portal_links: {
        Row: {
          company_id: string
          contact_id: string
          created_at: string
          created_by: string | null
          id: string
          last_viewed_at: string | null
          organization_id: string
          revoked_at: string | null
          token: string
          view_count: number
        }
        ComputedFields: never
        Insert: {
          company_id: string
          contact_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_viewed_at?: string | null
          organization_id: string
          revoked_at?: string | null
          token: string
          view_count?: number
        }
        Update: {
          company_id?: string
          contact_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_viewed_at?: string | null
          organization_id?: string
          revoked_at?: string | null
          token?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_portal_links_company_id_fkey"
            columns: ["company_id"]
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_portal_links_contact_id_fkey"
            columns: ["contact_id"]
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_portal_links_contact_id_fkey"
            columns: ["contact_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_portal_links_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_portal_links_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "customer_portal_links_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
          {
            foreignKeyName: "customer_portal_links_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      device_tokens: {
        Row: {
          app_version: string | null
          created_at: string
          id: string
          last_seen_at: string
          organization_id: string
          platform: string
          revoked_at: string | null
          token: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          app_version?: string | null
          created_at?: string
          id?: string
          last_seen_at?: string
          organization_id: string
          platform: string
          revoked_at?: string | null
          token: string
          user_id: string
        }
        Update: {
          app_version?: string | null
          created_at?: string
          id?: string
          last_seen_at?: string
          organization_id?: string
          platform?: string
          revoked_at?: string | null
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_tokens_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      dfy_progress: {
        Row: {
          company_id: string
          created_at: string
          escalated_at: string | null
          forward_help_requested_at: string | null
          forward_last_test_at: string | null
          forward_opened_at: string | null
          forward_tapped_at: string | null
          forward_tests_started: number
          forward_text_sent_at: string | null
          forward_token: string | null
          last_error: string | null
          last_run_at: string | null
          number_attempts: number
          number_flagged_at: string | null
          number_last_attempt_at: string | null
          number_last_error: string | null
          number_ready_at: string | null
          organization_id: string
          switch_on_attempts: number
          switch_on_detail: Json
          switched_on_at: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          company_id: string
          created_at?: string
          escalated_at?: string | null
          forward_help_requested_at?: string | null
          forward_last_test_at?: string | null
          forward_opened_at?: string | null
          forward_tapped_at?: string | null
          forward_tests_started?: number
          forward_text_sent_at?: string | null
          forward_token?: string | null
          last_error?: string | null
          last_run_at?: string | null
          number_attempts?: number
          number_flagged_at?: string | null
          number_last_attempt_at?: string | null
          number_last_error?: string | null
          number_ready_at?: string | null
          organization_id: string
          switch_on_attempts?: number
          switch_on_detail?: Json
          switched_on_at?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          escalated_at?: string | null
          forward_help_requested_at?: string | null
          forward_last_test_at?: string | null
          forward_opened_at?: string | null
          forward_tapped_at?: string | null
          forward_tests_started?: number
          forward_text_sent_at?: string | null
          forward_token?: string | null
          last_error?: string | null
          last_run_at?: string | null
          number_attempts?: number
          number_flagged_at?: string | null
          number_last_attempt_at?: string | null
          number_last_error?: string | null
          number_ready_at?: string | null
          organization_id?: string
          switch_on_attempts?: number
          switch_on_detail?: Json
          switched_on_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dfy_progress_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "dfy_progress_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_messages: {
        Row: {
          approval_id: string | null
          attempts: number
          body: string | null
          booking_id: string | null
          company_id: string
          contact_id: string | null
          created_at: string
          dedupe_key: string
          expires_at: string | null
          id: string
          kind: string
          not_before: string | null
          organization_id: string
          payload: Json
          profile_id: string | null
          reason: string | null
          sent_at: string | null
          status: string
          to_phone: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          approval_id?: string | null
          attempts?: number
          body?: string | null
          booking_id?: string | null
          company_id: string
          contact_id?: string | null
          created_at?: string
          dedupe_key: string
          expires_at?: string | null
          id?: string
          kind: string
          not_before?: string | null
          organization_id: string
          payload?: Json
          profile_id?: string | null
          reason?: string | null
          sent_at?: string | null
          status?: string
          to_phone?: string | null
          updated_at?: string
        }
        Update: {
          approval_id?: string | null
          attempts?: number
          body?: string | null
          booking_id?: string | null
          company_id?: string
          contact_id?: string | null
          created_at?: string
          dedupe_key?: string
          expires_at?: string | null
          id?: string
          kind?: string
          not_before?: string | null
          organization_id?: string
          payload?: Json
          profile_id?: string | null
          reason?: string | null
          sent_at?: string | null
          status?: string
          to_phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_messages_approval_id_fkey"
            columns: ["approval_id"]
            referencedRelation: "owner_approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_messages_booking_id_fkey"
            columns: ["booking_id"]
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_messages_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "dispatch_messages_contact_id_fkey"
            columns: ["contact_id"]
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_messages_contact_id_fkey"
            columns: ["contact_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_messages_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_messages_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_messages_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "dispatch_messages_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
        ]
      }
      dispatch_runs: {
        Row: {
          approval_id: string | null
          company_id: string
          created_at: string
          detail: Json
          id: string
          kind: string
          organization_id: string
          run_key: string
          status: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          approval_id?: string | null
          company_id: string
          created_at?: string
          detail?: Json
          id?: string
          kind: string
          organization_id: string
          run_key: string
          status?: string
          updated_at?: string
        }
        Update: {
          approval_id?: string | null
          company_id?: string
          created_at?: string
          detail?: Json
          id?: string
          kind?: string
          organization_id?: string
          run_key?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_runs_approval_id_fkey"
            columns: ["approval_id"]
            referencedRelation: "owner_approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_runs_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "dispatch_runs_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_weather_cache: {
        Row: {
          company_id: string
          fetched_at: string
          forecast: Json
          hour_key: string
          latitude: number
          longitude: number
          organization_id: string
        }
        ComputedFields: never
        Insert: {
          company_id: string
          fetched_at?: string
          forecast: Json
          hour_key: string
          latitude: number
          longitude: number
          organization_id: string
        }
        Update: {
          company_id?: string
          fetched_at?: string
          forecast?: Json
          hour_key?: string
          latitude?: number
          longitude?: number
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_weather_cache_company_id_fkey"
            columns: ["company_id"]
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_weather_cache_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_attachments: {
        Row: {
          company_id: string
          content_type: string | null
          created_at: string
          filename: string | null
          id: string
          inbound_email_id: string
          organization_id: string
          provider_attachment_id: string
          size_bytes: number | null
          status: string
          storage_path: string | null
        }
        ComputedFields: never
        Insert: {
          company_id: string
          content_type?: string | null
          created_at?: string
          filename?: string | null
          id?: string
          inbound_email_id: string
          organization_id: string
          provider_attachment_id: string
          size_bytes?: number | null
          status: string
          storage_path?: string | null
        }
        Update: {
          company_id?: string
          content_type?: string | null
          created_at?: string
          filename?: string | null
          id?: string
          inbound_email_id?: string
          organization_id?: string
          provider_attachment_id?: string
          size_bytes?: number | null
          status?: string
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_attachments_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "email_attachments_inbound_email_id_fkey"
            columns: ["inbound_email_id"]
            referencedRelation: "inbound_emails"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_attachments_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_clerk_digests: {
        Row: {
          attempts: number
          body: string | null
          company_id: string
          created_at: string
          email_ids: string[]
          id: string
          last_error: string | null
          local_date: string
          organization_id: string
          status: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          attempts?: number
          body?: string | null
          company_id: string
          created_at?: string
          email_ids?: string[]
          id?: string
          last_error?: string | null
          local_date: string
          organization_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          body?: string | null
          company_id?: string
          created_at?: string
          email_ids?: string[]
          id?: string
          last_error?: string | null
          local_date?: string
          organization_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_clerk_digests_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "email_clerk_digests_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_inboxes: {
        Row: {
          address: string
          company_id: string
          created_at: string
          forwarded_from: string | null
          forwarding_confirmed_at: string | null
          forwarding_requested_at: string | null
          id: string
          last_received_at: string | null
          organization_id: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          address: string
          company_id: string
          created_at?: string
          forwarded_from?: string | null
          forwarding_confirmed_at?: string | null
          forwarding_requested_at?: string | null
          id?: string
          last_received_at?: string | null
          organization_id: string
          updated_at?: string
        }
        Update: {
          address?: string
          company_id?: string
          created_at?: string
          forwarded_from?: string | null
          forwarding_confirmed_at?: string | null
          forwarding_requested_at?: string | null
          id?: string
          last_received_at?: string | null
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_inboxes_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "email_inboxes_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment: {
        Row: {
          booking_id: string | null
          company_id: string
          created_at: string
          hours: number | null
          id: string
          last_serviced_hours: number | null
          last_serviced_on: string | null
          location: string | null
          name: string
          notes: string | null
          organization_id: string
          out_at: string | null
          out_profile_id: string | null
          serial: string | null
          service_every_hours: number | null
          service_every_months: number | null
          status: string
          updated_at: string
          value_cents: number | null
        }
        ComputedFields: never
        Insert: {
          booking_id?: string | null
          company_id: string
          created_at?: string
          hours?: number | null
          id?: string
          last_serviced_hours?: number | null
          last_serviced_on?: string | null
          location?: string | null
          name: string
          notes?: string | null
          organization_id: string
          out_at?: string | null
          out_profile_id?: string | null
          serial?: string | null
          service_every_hours?: number | null
          service_every_months?: number | null
          status?: string
          updated_at?: string
          value_cents?: number | null
        }
        Update: {
          booking_id?: string | null
          company_id?: string
          created_at?: string
          hours?: number | null
          id?: string
          last_serviced_hours?: number | null
          last_serviced_on?: string | null
          location?: string | null
          name?: string
          notes?: string | null
          organization_id?: string
          out_at?: string | null
          out_profile_id?: string | null
          serial?: string | null
          service_every_hours?: number | null
          service_every_months?: number | null
          status?: string
          updated_at?: string
          value_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_booking_id_fkey"
            columns: ["booking_id"]
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "equipment_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_out_profile_id_fkey"
            columns: ["out_profile_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_out_profile_id_fkey"
            columns: ["out_profile_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "equipment_out_profile_id_fkey"
            columns: ["out_profile_id"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
        ]
      }
      estimate_requests: {
        Row: {
          approval_id: string | null
          company_id: string
          contact_id: string
          conversation_id: string | null
          created_at: string
          decision_claimed_at: string | null
          description: string
          error: string | null
          estimate: Json | null
          id: string
          organization_id: string
          owner_result: string | null
          photos: Json
          quote_id: string | null
          status: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          approval_id?: string | null
          company_id: string
          contact_id: string
          conversation_id?: string | null
          created_at?: string
          decision_claimed_at?: string | null
          description: string
          error?: string | null
          estimate?: Json | null
          id?: string
          organization_id: string
          owner_result?: string | null
          photos?: Json
          quote_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          approval_id?: string | null
          company_id?: string
          contact_id?: string
          conversation_id?: string | null
          created_at?: string
          decision_claimed_at?: string | null
          description?: string
          error?: string | null
          estimate?: Json | null
          id?: string
          organization_id?: string
          owner_result?: string | null
          photos?: Json
          quote_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "estimate_requests_approval_id_fkey"
            columns: ["approval_id"]
            referencedRelation: "owner_approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_requests_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "estimate_requests_contact_id_fkey"
            columns: ["contact_id"]
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_requests_contact_id_fkey"
            columns: ["contact_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_requests_conversation_id_fkey"
            columns: ["conversation_id"]
            referencedRelation: "sms_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_requests_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_requests_quote_id_fkey"
            columns: ["quote_id"]
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount_cents: number
          billable: boolean
          billed_invoice_id: string | null
          booking_id: string | null
          category: string
          company_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          organization_id: string
          paid_with: string
          receipt_path: string | null
          receipt_type: string | null
          reimbursed_at: string | null
          reimbursed_by: string | null
          spent_on: string
          tax_cents: number
          updated_at: string
          vendor: string | null
        }
        ComputedFields: never
        Insert: {
          amount_cents: number
          billable?: boolean
          billed_invoice_id?: string | null
          booking_id?: string | null
          category?: string
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          organization_id: string
          paid_with?: string
          receipt_path?: string | null
          receipt_type?: string | null
          reimbursed_at?: string | null
          reimbursed_by?: string | null
          spent_on: string
          tax_cents?: number
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          amount_cents?: number
          billable?: boolean
          billed_invoice_id?: string | null
          booking_id?: string | null
          category?: string
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          organization_id?: string
          paid_with?: string
          receipt_path?: string | null
          receipt_type?: string | null
          reimbursed_at?: string | null
          reimbursed_by?: string | null
          spent_on?: string
          tax_cents?: number
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_billed_invoice_id_fkey"
            columns: ["billed_invoice_id"]
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_booking_id_fkey"
            columns: ["booking_id"]
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_company_id_fkey"
            columns: ["company_id"]
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
          {
            foreignKeyName: "expenses_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_reimbursed_by_fkey"
            columns: ["reimbursed_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_reimbursed_by_fkey"
            columns: ["reimbursed_by"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "expenses_reimbursed_by_fkey"
            columns: ["reimbursed_by"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          created_at: string
          enabled: boolean
          feature: string
          limit_value: number | null
          organization_id: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          enabled?: boolean
          feature: string
          limit_value?: number | null
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          feature?: string
          limit_value?: number | null
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_flags_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_log: {
        Row: {
          booking_id: string | null
          company_id: string
          created_at: string
          equipment_id: string | null
          happened_at: string
          id: string
          kind: string
          label: string | null
          notes: string | null
          organization_id: string
          profile_id: string | null
          reading: number | null
          rental_id: string | null
          service_item_id: string | null
          source: string
          source_key: string | null
          vehicle_id: string | null
        }
        ComputedFields: never
        Insert: {
          booking_id?: string | null
          company_id: string
          created_at?: string
          equipment_id?: string | null
          happened_at?: string
          id?: string
          kind: string
          label?: string | null
          notes?: string | null
          organization_id: string
          profile_id?: string | null
          reading?: number | null
          rental_id?: string | null
          service_item_id?: string | null
          source?: string
          source_key?: string | null
          vehicle_id?: string | null
        }
        Update: {
          booking_id?: string | null
          company_id?: string
          created_at?: string
          equipment_id?: string | null
          happened_at?: string
          id?: string
          kind?: string
          label?: string | null
          notes?: string | null
          organization_id?: string
          profile_id?: string | null
          reading?: number | null
          rental_id?: string | null
          service_item_id?: string | null
          source?: string
          source_key?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fleet_log_booking_id_fkey"
            columns: ["booking_id"]
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_log_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "fleet_log_equipment_id_fkey"
            columns: ["equipment_id"]
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_log_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_log_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_log_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "fleet_log_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
          {
            foreignKeyName: "fleet_log_rental_id_fkey"
            columns: ["rental_id"]
            referencedRelation: "rentals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_log_service_item_id_fkey"
            columns: ["service_item_id"]
            referencedRelation: "vehicle_service_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_log_vehicle_id_fkey"
            columns: ["vehicle_id"]
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_reminders: {
        Row: {
          company_id: string
          created_at: string
          id: string
          local_date: string
          organization_id: string
          reminder_key: string
          subject_id: string
          subject_type: string
        }
        ComputedFields: never
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          local_date: string
          organization_id: string
          reminder_key: string
          subject_id: string
          subject_type: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          local_date?: string
          organization_id?: string
          reminder_key?: string
          subject_id?: string
          subject_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_reminders_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "fleet_reminders_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      forwarding_tests: {
        Row: {
          business_line: string
          caller_id: string
          catcher_number: string
          company_id: string
          completed_at: string | null
          created_at: string
          error_code: string | null
          error_message: string | null
          forwarded_call_sid: string | null
          forwarded_from: string | null
          id: string
          notified_at: string | null
          organization_id: string
          outbound_answered_by: string | null
          outbound_call_sid: string | null
          outbound_duration_seconds: number | null
          outbound_status: string | null
          requested_by: string | null
          started_at: string
          status: string
          trigger: string
          updated_at: string
          voice_number_id: string
        }
        ComputedFields: never
        Insert: {
          business_line: string
          caller_id: string
          catcher_number: string
          company_id: string
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          forwarded_call_sid?: string | null
          forwarded_from?: string | null
          id?: string
          notified_at?: string | null
          organization_id: string
          outbound_answered_by?: string | null
          outbound_call_sid?: string | null
          outbound_duration_seconds?: number | null
          outbound_status?: string | null
          requested_by?: string | null
          started_at?: string
          status?: string
          trigger: string
          updated_at?: string
          voice_number_id: string
        }
        Update: {
          business_line?: string
          caller_id?: string
          catcher_number?: string
          company_id?: string
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          forwarded_call_sid?: string | null
          forwarded_from?: string | null
          id?: string
          notified_at?: string | null
          organization_id?: string
          outbound_answered_by?: string | null
          outbound_call_sid?: string | null
          outbound_duration_seconds?: number | null
          outbound_status?: string | null
          requested_by?: string | null
          started_at?: string
          status?: string
          trigger?: string
          updated_at?: string
          voice_number_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forwarding_tests_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "forwarding_tests_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forwarding_tests_requested_by_fkey"
            columns: ["requested_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forwarding_tests_requested_by_fkey"
            columns: ["requested_by"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "forwarding_tests_requested_by_fkey"
            columns: ["requested_by"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
          {
            foreignKeyName: "forwarding_tests_voice_number_id_fkey"
            columns: ["voice_number_id"]
            referencedRelation: "voice_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      google_post_drafts: {
        Row: {
          approval_id: string | null
          body: string | null
          company_id: string
          created_at: string
          id: string
          organization_id: string
          owner_texted_at: string | null
          status: string
          topic: string
          updated_at: string
          week_start: string
        }
        ComputedFields: never
        Insert: {
          approval_id?: string | null
          body?: string | null
          company_id: string
          created_at?: string
          id?: string
          organization_id: string
          owner_texted_at?: string | null
          status?: string
          topic: string
          updated_at?: string
          week_start: string
        }
        Update: {
          approval_id?: string | null
          body?: string | null
          company_id?: string
          created_at?: string
          id?: string
          organization_id?: string
          owner_texted_at?: string | null
          status?: string
          topic?: string
          updated_at?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_post_drafts_approval_id_fkey"
            columns: ["approval_id"]
            referencedRelation: "owner_approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_post_drafts_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "google_post_drafts_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      google_reviews: {
        Row: {
          approval_id: string | null
          author_name: string | null
          company_id: string
          created_at: string
          google_maps_uri: string | null
          id: string
          organization_id: string
          owner_alerted_at: string | null
          owner_texted_at: string | null
          published_at: string | null
          rating: number | null
          reply_draft: string | null
          reply_status: string
          review_name: string
          text: string | null
          text_pruned_at: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          approval_id?: string | null
          author_name?: string | null
          company_id: string
          created_at?: string
          google_maps_uri?: string | null
          id?: string
          organization_id: string
          owner_alerted_at?: string | null
          owner_texted_at?: string | null
          published_at?: string | null
          rating?: number | null
          reply_draft?: string | null
          reply_status?: string
          review_name: string
          text?: string | null
          text_pruned_at?: string | null
          updated_at?: string
        }
        Update: {
          approval_id?: string | null
          author_name?: string | null
          company_id?: string
          created_at?: string
          google_maps_uri?: string | null
          id?: string
          organization_id?: string
          owner_alerted_at?: string | null
          owner_texted_at?: string | null
          published_at?: string | null
          rating?: number | null
          reply_draft?: string | null
          reply_status?: string
          review_name?: string
          text?: string | null
          text_pruned_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_reviews_approval_id_fkey"
            columns: ["approval_id"]
            referencedRelation: "owner_approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_reviews_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "google_reviews_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      help_chat_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          metadata: Json
          organization_id: string
          profile_id: string | null
          session_id: string | null
          support_request_id: string | null
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          organization_id: string
          profile_id?: string | null
          session_id?: string | null
          support_request_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          organization_id?: string
          profile_id?: string | null
          session_id?: string | null
          support_request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "help_chat_events_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "help_chat_events_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "help_chat_events_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "help_chat_events_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
          {
            foreignKeyName: "help_chat_events_support_request_id_fkey"
            columns: ["support_request_id"]
            referencedRelation: "support_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      hst_periods: {
        Row: {
          approval_id: string | null
          attempts: number
          company_id: string
          created_at: string
          due_date: string
          figures: Json
          frequency: string
          id: string
          label: string
          organization_id: string
          packet_claimed_at: string | null
          packet_emailed_at: string | null
          packet_emailed_to: string | null
          packet_error: string | null
          payment_due_date: string
          period_end: string
          period_start: string
          reminded_at: string | null
          reminder_body: string | null
          status: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          approval_id?: string | null
          attempts?: number
          company_id: string
          created_at?: string
          due_date: string
          figures?: Json
          frequency: string
          id?: string
          label: string
          organization_id: string
          packet_claimed_at?: string | null
          packet_emailed_at?: string | null
          packet_emailed_to?: string | null
          packet_error?: string | null
          payment_due_date: string
          period_end: string
          period_start: string
          reminded_at?: string | null
          reminder_body?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          approval_id?: string | null
          attempts?: number
          company_id?: string
          created_at?: string
          due_date?: string
          figures?: Json
          frequency?: string
          id?: string
          label?: string
          organization_id?: string
          packet_claimed_at?: string | null
          packet_emailed_at?: string | null
          packet_emailed_to?: string | null
          packet_error?: string | null
          payment_due_date?: string
          period_end?: string
          period_start?: string
          reminded_at?: string | null
          reminder_body?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hst_periods_approval_id_fkey"
            columns: ["approval_id"]
            referencedRelation: "owner_approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hst_periods_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "hst_periods_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batches: {
        Row: {
          chase_approval_id: string | null
          chase_status: string | null
          company_id: string
          counts: Json | null
          created_at: string
          created_by: string | null
          cursor: number
          date_orders: Json | null
          duplicate_rows: number
          error: string | null
          failures: number
          file_kind: string
          file_name: string
          file_path: string
          file_sha256: string | null
          file_size: number | null
          headers: Json
          id: string
          import_finished_at: string | null
          import_started_at: string | null
          lease_id: string | null
          leased_until: string | null
          mapping: Json
          mapping_source: string | null
          organization_id: string
          owner_notified_at: string | null
          preview: Json | null
          purged_at: string | null
          samples: Json
          sheet_name: string | null
          source: string
          status: string
          total_rows: number
          undo_cursor: string | null
          undo_phase: string | null
          undo_report: Json | null
          undone_at: string | null
          unsure_columns: Json
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          chase_approval_id?: string | null
          chase_status?: string | null
          company_id: string
          counts?: Json | null
          created_at?: string
          created_by?: string | null
          cursor?: number
          date_orders?: Json | null
          duplicate_rows?: number
          error?: string | null
          failures?: number
          file_kind: string
          file_name: string
          file_path: string
          file_sha256?: string | null
          file_size?: number | null
          headers?: Json
          id?: string
          import_finished_at?: string | null
          import_started_at?: string | null
          lease_id?: string | null
          leased_until?: string | null
          mapping?: Json
          mapping_source?: string | null
          organization_id: string
          owner_notified_at?: string | null
          preview?: Json | null
          purged_at?: string | null
          samples?: Json
          sheet_name?: string | null
          source?: string
          status?: string
          total_rows?: number
          undo_cursor?: string | null
          undo_phase?: string | null
          undo_report?: Json | null
          undone_at?: string | null
          unsure_columns?: Json
          updated_at?: string
        }
        Update: {
          chase_approval_id?: string | null
          chase_status?: string | null
          company_id?: string
          counts?: Json | null
          created_at?: string
          created_by?: string | null
          cursor?: number
          date_orders?: Json | null
          duplicate_rows?: number
          error?: string | null
          failures?: number
          file_kind?: string
          file_name?: string
          file_path?: string
          file_sha256?: string | null
          file_size?: number | null
          headers?: Json
          id?: string
          import_finished_at?: string | null
          import_started_at?: string | null
          lease_id?: string | null
          leased_until?: string | null
          mapping?: Json
          mapping_source?: string | null
          organization_id?: string
          owner_notified_at?: string | null
          preview?: Json | null
          purged_at?: string | null
          samples?: Json
          sheet_name?: string | null
          source?: string
          status?: string
          total_rows?: number
          undo_cursor?: string | null
          undo_phase?: string | null
          undo_report?: Json | null
          undone_at?: string | null
          unsure_columns?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_chase_approval_id_fkey"
            columns: ["chase_approval_id"]
            referencedRelation: "owner_approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "import_batches_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "import_batches_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
          {
            foreignKeyName: "import_batches_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      import_links: {
        Row: {
          company_id: string
          created_at: string
          expires_at: string
          id: string
          organization_id: string
          sent_at: string | null
          token: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          company_id: string
          created_at?: string
          expires_at: string
          id?: string
          organization_id: string
          sent_at?: string | null
          token: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          organization_id?: string
          sent_at?: string | null
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_links_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "import_links_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      import_rows: {
        Row: {
          account_created: boolean
          account_id: string | null
          applied_at: string | null
          balance_cents: number
          balances_skipped: number
          batch_id: string
          cells: Json
          company_id: string
          contact_created: boolean
          contact_id: string | null
          created_at: string
          filled: Json | null
          id: string
          invoice_id: string | null
          jobs_created: number
          jobs_skipped: number
          organization_id: string
          outcome: string | null
          reason: string | null
          row_hash: string
          row_index: number
        }
        ComputedFields: never
        Insert: {
          account_created?: boolean
          account_id?: string | null
          applied_at?: string | null
          balance_cents?: number
          balances_skipped?: number
          batch_id: string
          cells?: Json
          company_id: string
          contact_created?: boolean
          contact_id?: string | null
          created_at?: string
          filled?: Json | null
          id?: string
          invoice_id?: string | null
          jobs_created?: number
          jobs_skipped?: number
          organization_id: string
          outcome?: string | null
          reason?: string | null
          row_hash: string
          row_index: number
        }
        Update: {
          account_created?: boolean
          account_id?: string | null
          applied_at?: string | null
          balance_cents?: number
          balances_skipped?: number
          batch_id?: string
          cells?: Json
          company_id?: string
          contact_created?: boolean
          contact_id?: string | null
          created_at?: string
          filled?: Json | null
          id?: string
          invoice_id?: string | null
          jobs_created?: number
          jobs_skipped?: number
          organization_id?: string
          outcome?: string | null
          reason?: string | null
          row_hash?: string
          row_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_rows_batch_id_fkey"
            columns: ["batch_id"]
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "import_rows_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      inbound_emails: {
        Row: {
          ai_summary: string | null
          approval_id: string | null
          attachments_meta: Json
          attempts: number
          auth: Json | null
          booking_id: string | null
          category: string | null
          cc_addresses: string[]
          classified_by: string | null
          company_id: string
          contact_id: string | null
          created_at: string
          detail: Json | null
          digest_date: string | null
          draft_reply: string | null
          draft_subject: string | null
          from_address: string | null
          from_name: string | null
          headers: Json | null
          html_excerpt: string | null
          id: string
          in_reply_to: string | null
          inbox_id: string
          last_error: string | null
          locked_until: string | null
          message_id: string
          message_log_id: string | null
          organization_id: string
          owner_alert_status: string
          owner_alerted_at: string | null
          processed_at: string | null
          provider: string
          provider_email_id: string
          purchase_order_id: string | null
          received_at: string
          reference_ids: string[]
          replied_at: string | null
          reply_status: string
          reply_to: string | null
          status: string
          subject: string | null
          supplier_id: string | null
          task_id: string | null
          text_body: string | null
          thread_key: string | null
          to_addresses: string[]
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          ai_summary?: string | null
          approval_id?: string | null
          attachments_meta?: Json
          attempts?: number
          auth?: Json | null
          booking_id?: string | null
          category?: string | null
          cc_addresses?: string[]
          classified_by?: string | null
          company_id: string
          contact_id?: string | null
          created_at?: string
          detail?: Json | null
          digest_date?: string | null
          draft_reply?: string | null
          draft_subject?: string | null
          from_address?: string | null
          from_name?: string | null
          headers?: Json | null
          html_excerpt?: string | null
          id?: string
          in_reply_to?: string | null
          inbox_id: string
          last_error?: string | null
          locked_until?: string | null
          message_id: string
          message_log_id?: string | null
          organization_id: string
          owner_alert_status?: string
          owner_alerted_at?: string | null
          processed_at?: string | null
          provider?: string
          provider_email_id: string
          purchase_order_id?: string | null
          received_at?: string
          reference_ids?: string[]
          replied_at?: string | null
          reply_status?: string
          reply_to?: string | null
          status?: string
          subject?: string | null
          supplier_id?: string | null
          task_id?: string | null
          text_body?: string | null
          thread_key?: string | null
          to_addresses?: string[]
          updated_at?: string
        }
        Update: {
          ai_summary?: string | null
          approval_id?: string | null
          attachments_meta?: Json
          attempts?: number
          auth?: Json | null
          booking_id?: string | null
          category?: string | null
          cc_addresses?: string[]
          classified_by?: string | null
          company_id?: string
          contact_id?: string | null
          created_at?: string
          detail?: Json | null
          digest_date?: string | null
          draft_reply?: string | null
          draft_subject?: string | null
          from_address?: string | null
          from_name?: string | null
          headers?: Json | null
          html_excerpt?: string | null
          id?: string
          in_reply_to?: string | null
          inbox_id?: string
          last_error?: string | null
          locked_until?: string | null
          message_id?: string
          message_log_id?: string | null
          organization_id?: string
          owner_alert_status?: string
          owner_alerted_at?: string | null
          processed_at?: string | null
          provider?: string
          provider_email_id?: string
          purchase_order_id?: string | null
          received_at?: string
          reference_ids?: string[]
          replied_at?: string | null
          reply_status?: string
          reply_to?: string | null
          status?: string
          subject?: string | null
          supplier_id?: string | null
          task_id?: string | null
          text_body?: string | null
          thread_key?: string | null
          to_addresses?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbound_emails_booking_id_fkey"
            columns: ["booking_id"]
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_emails_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "inbound_emails_contact_id_fkey"
            columns: ["contact_id"]
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_emails_contact_id_fkey"
            columns: ["contact_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_emails_inbox_id_fkey"
            columns: ["inbox_id"]
            referencedRelation: "email_inboxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_emails_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      inbound_webhook_jobs: {
        Row: {
          attempts: number
          claimed_at: string | null
          claimed_by: string | null
          company_id: string | null
          created_at: string
          external_id: string
          id: string
          last_error: string | null
          max_attempts: number
          organization_id: string | null
          payload: Json
          provider: string
          run_at: string
          status: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          attempts?: number
          claimed_at?: string | null
          claimed_by?: string | null
          company_id?: string | null
          created_at?: string
          external_id: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          organization_id?: string | null
          payload: Json
          provider: string
          run_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          claimed_at?: string | null
          claimed_by?: string | null
          company_id?: string | null
          created_at?: string
          external_id?: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          organization_id?: string | null
          payload?: Json
          provider?: string
          run_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbound_webhook_jobs_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      installed_equipment: {
        Row: {
          active: boolean
          booking_id: string | null
          company_id: string
          contact_id: string | null
          created_at: string
          id: string
          installed_on: string | null
          make: string | null
          manufacturer_warranty_ends: string | null
          model: string | null
          notes: string | null
          organization_id: string
          serial: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          active?: boolean
          booking_id?: string | null
          company_id: string
          contact_id?: string | null
          created_at?: string
          id?: string
          installed_on?: string | null
          make?: string | null
          manufacturer_warranty_ends?: string | null
          model?: string | null
          notes?: string | null
          organization_id: string
          serial?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          booking_id?: string | null
          company_id?: string
          contact_id?: string | null
          created_at?: string
          id?: string
          installed_on?: string | null
          make?: string | null
          manufacturer_warranty_ends?: string | null
          model?: string | null
          notes?: string | null
          organization_id?: string
          serial?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "installed_equipment_booking_id_fkey"
            columns: ["booking_id"]
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installed_equipment_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "installed_equipment_contact_id_fkey"
            columns: ["contact_id"]
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installed_equipment_contact_id_fkey"
            columns: ["contact_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installed_equipment_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_keys: {
        Row: {
          active: boolean
          company_id: string | null
          created_at: string
          created_by: string | null
          id: string
          key_hash: string
          key_prefix: string
          label: string | null
          last_used_at: string | null
          organization_id: string
        }
        ComputedFields: never
        Insert: {
          active?: boolean
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          label?: string | null
          last_used_at?: string | null
          organization_id: string
        }
        Update: {
          active?: boolean
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          label?: string | null
          last_used_at?: string | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intake_keys_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "intake_keys_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_collections: {
        Row: {
          company_id: string
          contact_id: string | null
          created_at: string
          final_notice_approval_id: string | null
          final_notice_status: string
          hold_reason: string | null
          hold_until: string | null
          id: string
          invoice_id: string
          last_sms_at: string | null
          organization_id: string
          promise_date: string | null
          promise_recorded_at: string | null
          promise_status: string | null
          sms_count: number
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          company_id: string
          contact_id?: string | null
          created_at?: string
          final_notice_approval_id?: string | null
          final_notice_status?: string
          hold_reason?: string | null
          hold_until?: string | null
          id?: string
          invoice_id: string
          last_sms_at?: string | null
          organization_id: string
          promise_date?: string | null
          promise_recorded_at?: string | null
          promise_status?: string | null
          sms_count?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          contact_id?: string | null
          created_at?: string
          final_notice_approval_id?: string | null
          final_notice_status?: string
          hold_reason?: string | null
          hold_until?: string | null
          id?: string
          invoice_id?: string
          last_sms_at?: string | null
          organization_id?: string
          promise_date?: string | null
          promise_recorded_at?: string | null
          promise_status?: string | null
          sms_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_collections_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "invoice_collections_contact_id_fkey"
            columns: ["contact_id"]
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_collections_contact_id_fkey"
            columns: ["contact_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_collections_final_notice_approval_id_fkey"
            columns: ["final_notice_approval_id"]
            referencedRelation: "owner_approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_collections_invoice_id_fkey"
            columns: ["invoice_id"]
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_collections_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_events: {
        Row: {
          actor_profile_id: string | null
          created_at: string
          event_type: string
          id: string
          invoice_id: string
          metadata: Json
          organization_id: string
        }
        ComputedFields: never
        Insert: {
          actor_profile_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          invoice_id: string
          metadata?: Json
          organization_id: string
        }
        Update: {
          actor_profile_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          invoice_id?: string
          metadata?: Json
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_events_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_events_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "invoice_events_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
          {
            foreignKeyName: "invoice_events_invoice_id_organization_id_fkey"
            columns: ["invoice_id", "organization_id"]
            referencedRelation: "invoices"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "invoice_events_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_number_counters: {
        Row: {
          company_id: string
          last_number: number
          organization_id: string
          year: number
        }
        ComputedFields: never
        Insert: {
          company_id: string
          last_number?: number
          organization_id: string
          year: number
        }
        Update: {
          company_id?: string
          last_number?: number
          organization_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_number_counters_company_id_fkey"
            columns: ["company_id"]
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_number_counters_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_payments: {
        Row: {
          amount_cents: number
          company_id: string
          created_at: string
          failure_reason: string | null
          id: string
          invoice_id: string
          method: string
          notes: string | null
          organization_id: string
          received_at: string
          recorded_by: string | null
          reference: string | null
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          amount_cents: number
          company_id: string
          created_at?: string
          failure_reason?: string | null
          id?: string
          invoice_id: string
          method: string
          notes?: string | null
          organization_id: string
          received_at?: string
          recorded_by?: string | null
          reference?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          company_id?: string
          created_at?: string
          failure_reason?: string | null
          id?: string
          invoice_id?: string
          method?: string
          notes?: string | null
          organization_id?: string
          received_at?: string
          recorded_by?: string | null
          reference?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payments_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "invoice_payments_invoice_id_organization_id_fkey"
            columns: ["invoice_id", "organization_id"]
            referencedRelation: "invoices"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "invoice_payments_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payments_recorded_by_fkey"
            columns: ["recorded_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payments_recorded_by_fkey"
            columns: ["recorded_by"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "invoice_payments_recorded_by_fkey"
            columns: ["recorded_by"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
        ]
      }
      invoice_reminder_texts: {
        Row: {
          approval_id: string | null
          balance_cents: number | null
          body: string | null
          company_id: string
          contact_id: string | null
          created_at: string
          id: string
          invoice_id: string
          kind: string
          organization_id: string
          reason: string | null
          reminder_key: string
          sent_at: string | null
          status: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          approval_id?: string | null
          balance_cents?: number | null
          body?: string | null
          company_id: string
          contact_id?: string | null
          created_at?: string
          id?: string
          invoice_id: string
          kind: string
          organization_id: string
          reason?: string | null
          reminder_key: string
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          approval_id?: string | null
          balance_cents?: number | null
          body?: string | null
          company_id?: string
          contact_id?: string | null
          created_at?: string
          id?: string
          invoice_id?: string
          kind?: string
          organization_id?: string
          reason?: string | null
          reminder_key?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_reminder_texts_approval_id_fkey"
            columns: ["approval_id"]
            referencedRelation: "owner_approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_reminder_texts_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "invoice_reminder_texts_contact_id_fkey"
            columns: ["contact_id"]
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_reminder_texts_contact_id_fkey"
            columns: ["contact_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_reminder_texts_invoice_id_fkey"
            columns: ["invoice_id"]
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_reminder_texts_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_paid_cents: number
          balance_due_cents: number
          bill_to: Json
          booking_id: string | null
          company_id: string
          contact_id: string | null
          created_at: string
          created_by: string | null
          credit_cents: number
          currency: string
          customer_account_id: string | null
          due_date: string | null
          email_open_count: number
          first_email_opened_at: string | null
          first_viewed_at: string | null
          id: string
          import_batch_id: string | null
          import_hold: boolean
          import_key: string | null
          imported_at: string | null
          internal_notes: string | null
          invoice_number: string | null
          issue_date: string | null
          last_email_opened_at: string | null
          last_reminder_at: string | null
          last_viewed_at: string | null
          line_items: Json
          notes: string | null
          organization_id: string
          paid_at: string | null
          paid_notified_at: string | null
          payment_terms_days: number
          pending_payment_cents: number
          public_token: string
          quote_id: string | null
          reminder_count: number
          reminders_paused: boolean
          sent_at: string | null
          status: string
          stripe_checkout_session_id: string | null
          subtotal_cents: number
          tax_cents: number
          tax_rate_bps: number
          title: string | null
          total_cents: number
          updated_at: string
          view_count: number
          void_reason: string | null
          voided_at: string | null
        }
        ComputedFields: never
        Insert: {
          amount_paid_cents?: number
          balance_due_cents?: number
          bill_to?: Json
          booking_id?: string | null
          company_id: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          credit_cents?: number
          currency?: string
          customer_account_id?: string | null
          due_date?: string | null
          email_open_count?: number
          first_email_opened_at?: string | null
          first_viewed_at?: string | null
          id?: string
          import_batch_id?: string | null
          import_hold?: boolean
          import_key?: string | null
          imported_at?: string | null
          internal_notes?: string | null
          invoice_number?: string | null
          issue_date?: string | null
          last_email_opened_at?: string | null
          last_reminder_at?: string | null
          last_viewed_at?: string | null
          line_items?: Json
          notes?: string | null
          organization_id: string
          paid_at?: string | null
          paid_notified_at?: string | null
          payment_terms_days?: number
          pending_payment_cents?: number
          public_token: string
          quote_id?: string | null
          reminder_count?: number
          reminders_paused?: boolean
          sent_at?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          subtotal_cents?: number
          tax_cents?: number
          tax_rate_bps?: number
          title?: string | null
          total_cents?: number
          updated_at?: string
          view_count?: number
          void_reason?: string | null
          voided_at?: string | null
        }
        Update: {
          amount_paid_cents?: number
          balance_due_cents?: number
          bill_to?: Json
          booking_id?: string | null
          company_id?: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          credit_cents?: number
          currency?: string
          customer_account_id?: string | null
          due_date?: string | null
          email_open_count?: number
          first_email_opened_at?: string | null
          first_viewed_at?: string | null
          id?: string
          import_batch_id?: string | null
          import_hold?: boolean
          import_key?: string | null
          imported_at?: string | null
          internal_notes?: string | null
          invoice_number?: string | null
          issue_date?: string | null
          last_email_opened_at?: string | null
          last_reminder_at?: string | null
          last_viewed_at?: string | null
          line_items?: Json
          notes?: string | null
          organization_id?: string
          paid_at?: string | null
          paid_notified_at?: string | null
          payment_terms_days?: number
          pending_payment_cents?: number
          public_token?: string
          quote_id?: string | null
          reminder_count?: number
          reminders_paused?: boolean
          sent_at?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          subtotal_cents?: number
          tax_cents?: number
          tax_rate_bps?: number
          title?: string | null
          total_cents?: number
          updated_at?: string
          view_count?: number
          void_reason?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_booking_id_organization_id_fkey"
            columns: ["booking_id", "organization_id"]
            referencedRelation: "bookings"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "invoices_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "invoices_contact_id_organization_id_fkey"
            columns: ["contact_id", "organization_id"]
            referencedRelation: "contacts"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "invoices_contact_id_organization_id_fkey"
            columns: ["contact_id", "organization_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
          {
            foreignKeyName: "invoices_customer_account_id_organization_id_fkey"
            columns: ["customer_account_id", "organization_id"]
            referencedRelation: "customer_accounts"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "invoices_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_quote_id_fkey"
            columns: ["quote_id"]
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      job_applicants: {
        Row: {
          answers: Json
          applied_count: number
          availability: string | null
          company_id: string
          confirmation_sent_at: string | null
          confirmation_status: string
          contact_id: string | null
          created_at: string
          digest_at: string | null
          drivers_licence: boolean | null
          email: string | null
          experience: string | null
          has_vehicle: boolean | null
          id: string
          invite_approval_id: string | null
          invite_send_after: string | null
          invited_at: string | null
          job_id: string
          last_applied_at: string
          name: string
          organization_id: string
          phone: string
          score: number | null
          score_reason: string | null
          screen_attempts: number
          screened_at: string | null
          screening: Json | null
          screening_source: string | null
          status: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          answers?: Json
          applied_count?: number
          availability?: string | null
          company_id: string
          confirmation_sent_at?: string | null
          confirmation_status?: string
          contact_id?: string | null
          created_at?: string
          digest_at?: string | null
          drivers_licence?: boolean | null
          email?: string | null
          experience?: string | null
          has_vehicle?: boolean | null
          id?: string
          invite_approval_id?: string | null
          invite_send_after?: string | null
          invited_at?: string | null
          job_id: string
          last_applied_at?: string
          name: string
          organization_id: string
          phone: string
          score?: number | null
          score_reason?: string | null
          screen_attempts?: number
          screened_at?: string | null
          screening?: Json | null
          screening_source?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          answers?: Json
          applied_count?: number
          availability?: string | null
          company_id?: string
          confirmation_sent_at?: string | null
          confirmation_status?: string
          contact_id?: string | null
          created_at?: string
          digest_at?: string | null
          drivers_licence?: boolean | null
          email?: string | null
          experience?: string | null
          has_vehicle?: boolean | null
          id?: string
          invite_approval_id?: string | null
          invite_send_after?: string | null
          invited_at?: string | null
          job_id?: string
          last_applied_at?: string
          name?: string
          organization_id?: string
          phone?: string
          score?: number | null
          score_reason?: string | null
          screen_attempts?: number
          screened_at?: string | null
          screening?: Json | null
          screening_source?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_applicants_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "job_applicants_contact_id_fkey"
            columns: ["contact_id"]
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_applicants_contact_id_fkey"
            columns: ["contact_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_applicants_invite_approval_id_fkey"
            columns: ["invite_approval_id"]
            referencedRelation: "owner_approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_applicants_job_id_fkey"
            columns: ["job_id"]
            referencedRelation: "job_postings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_applicants_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      job_materials: {
        Row: {
          booking_id: string
          created_at: string
          created_by: string | null
          id: string
          label: string
          organization_id: string
          quantity: number
          unit_cost_cents: number
        }
        ComputedFields: never
        Insert: {
          booking_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          organization_id: string
          quantity?: number
          unit_cost_cents: number
        }
        Update: {
          booking_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          organization_id?: string
          quantity?: number
          unit_cost_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_materials_booking_id_fkey"
            columns: ["booking_id"]
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_materials_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_materials_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "job_materials_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
          {
            foreignKeyName: "job_materials_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      job_photos: {
        Row: {
          booking_id: string
          bytes: number | null
          caption: string | null
          company_id: string
          created_at: string
          height: number | null
          id: string
          latitude: number | null
          longitude: number | null
          organization_id: string
          storage_path: string
          taken_at: string
          taken_by: string | null
          width: number | null
        }
        ComputedFields: never
        Insert: {
          booking_id: string
          bytes?: number | null
          caption?: string | null
          company_id: string
          created_at?: string
          height?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          organization_id: string
          storage_path: string
          taken_at?: string
          taken_by?: string | null
          width?: number | null
        }
        Update: {
          booking_id?: string
          bytes?: number | null
          caption?: string | null
          company_id?: string
          created_at?: string
          height?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          organization_id?: string
          storage_path?: string
          taken_at?: string
          taken_by?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "job_photos_booking_id_fkey"
            columns: ["booking_id"]
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_photos_company_id_fkey"
            columns: ["company_id"]
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_photos_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_photos_taken_by_fkey"
            columns: ["taken_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_photos_taken_by_fkey"
            columns: ["taken_by"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "job_photos_taken_by_fkey"
            columns: ["taken_by"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
        ]
      }
      job_postings: {
        Row: {
          approval_id: string | null
          closed_at: string | null
          company_id: string
          created_at: string
          custom_questions: Json
          draft_source: string
          duties: Json
          employment_type: string | null
          id: string
          location: string | null
          nice_to_have: Json
          organization_id: string
          owner_request: string | null
          owner_texted_at: string | null
          pay_text: string | null
          published_at: string | null
          requirements: Json
          start_text: string | null
          status: string
          summary: string | null
          title: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          approval_id?: string | null
          closed_at?: string | null
          company_id: string
          created_at?: string
          custom_questions?: Json
          draft_source?: string
          duties?: Json
          employment_type?: string | null
          id?: string
          location?: string | null
          nice_to_have?: Json
          organization_id: string
          owner_request?: string | null
          owner_texted_at?: string | null
          pay_text?: string | null
          published_at?: string | null
          requirements?: Json
          start_text?: string | null
          status?: string
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          approval_id?: string | null
          closed_at?: string | null
          company_id?: string
          created_at?: string
          custom_questions?: Json
          draft_source?: string
          duties?: Json
          employment_type?: string | null
          id?: string
          location?: string | null
          nice_to_have?: Json
          organization_id?: string
          owner_request?: string | null
          owner_texted_at?: string | null
          pay_text?: string | null
          published_at?: string | null
          requirements?: Json
          start_text?: string | null
          status?: string
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_postings_approval_id_fkey"
            columns: ["approval_id"]
            referencedRelation: "owner_approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_postings_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "job_postings_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      job_warranties: {
        Row: {
          booking_id: string
          company_id: string
          contact_id: string | null
          created_at: string
          ends_on: string
          id: string
          job_label: string | null
          months: number
          organization_id: string
          source: string
          starts_on: string
          terms_text: string | null
        }
        ComputedFields: never
        Insert: {
          booking_id: string
          company_id: string
          contact_id?: string | null
          created_at?: string
          ends_on: string
          id?: string
          job_label?: string | null
          months: number
          organization_id: string
          source?: string
          starts_on: string
          terms_text?: string | null
        }
        Update: {
          booking_id?: string
          company_id?: string
          contact_id?: string | null
          created_at?: string
          ends_on?: string
          id?: string
          job_label?: string | null
          months?: number
          organization_id?: string
          source?: string
          starts_on?: string
          terms_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_warranties_booking_id_fkey"
            columns: ["booking_id"]
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_warranties_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "job_warranties_contact_id_fkey"
            columns: ["contact_id"]
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_warranties_contact_id_fkey"
            columns: ["contact_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_warranties_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      legacy_usage: {
        Row: {
          count: number
          day: string
          first_seen: string
          key: string
          kind: string
          last_seen: string
          sample: string | null
        }
        ComputedFields: never
        Insert: {
          count?: number
          day?: string
          first_seen?: string
          key: string
          kind: string
          last_seen?: string
          sample?: string | null
        }
        Update: {
          count?: number
          day?: string
          first_seen?: string
          key?: string
          kind?: string
          last_seen?: string
          sample?: string | null
        }
        Relationships: []
      }
      marketing_campaign_recipients: {
        Row: {
          campaign_id: string
          claimed_at: string | null
          company_id: string
          contact_id: string
          created_at: string
          id: string
          last_purchase_at: string | null
          message_log_id: string | null
          organization_id: string
          provider_ref: string | null
          reason: string | null
          sent_at: string | null
          status: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          campaign_id: string
          claimed_at?: string | null
          company_id: string
          contact_id: string
          created_at?: string
          id?: string
          last_purchase_at?: string | null
          message_log_id?: string | null
          organization_id: string
          provider_ref?: string | null
          reason?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          claimed_at?: string | null
          company_id?: string
          contact_id?: string
          created_at?: string
          id?: string
          last_purchase_at?: string | null
          message_log_id?: string | null
          organization_id?: string
          provider_ref?: string | null
          reason?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_campaign_recipients_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "marketing_campaign_recipients_contact_id_fkey"
            columns: ["contact_id"]
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_campaign_recipients_contact_id_fkey"
            columns: ["contact_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_campaign_recipients_message_log_id_fkey"
            columns: ["message_log_id"]
            referencedRelation: "message_log"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_campaign_recipients_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_campaigns: {
        Row: {
          approval_id: string | null
          approved_at: string | null
          audience_count: number
          audience_filter: Json
          cancel_reason: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string
          failed_count: number
          held_since: string | null
          hold_notified_at: string | null
          hold_reason: string | null
          id: string
          kind: string
          message: string | null
          organization_id: string
          period_key: string | null
          scheduled_for: string | null
          send_window: Json
          sent_count: number
          skipped_count: number
          started_at: string | null
          status: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          approval_id?: string | null
          approved_at?: string | null
          audience_count?: number
          audience_filter?: Json
          cancel_reason?: string | null
          company_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string
          failed_count?: number
          held_since?: string | null
          hold_notified_at?: string | null
          hold_reason?: string | null
          id?: string
          kind?: string
          message?: string | null
          organization_id: string
          period_key?: string | null
          scheduled_for?: string | null
          send_window?: Json
          sent_count?: number
          skipped_count?: number
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          approval_id?: string | null
          approved_at?: string | null
          audience_count?: number
          audience_filter?: Json
          cancel_reason?: string | null
          company_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string
          failed_count?: number
          held_since?: string | null
          hold_notified_at?: string | null
          hold_reason?: string | null
          id?: string
          kind?: string
          message?: string | null
          organization_id?: string
          period_key?: string | null
          scheduled_for?: string | null
          send_window?: Json
          sent_count?: number
          skipped_count?: number
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_campaigns_approval_id_fkey"
            columns: ["approval_id"]
            referencedRelation: "owner_approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_campaigns_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "marketing_campaigns_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_sweep_claims: {
        Row: {
          company_id: string
          created_at: string
          period_key: string
          task: string
        }
        ComputedFields: never
        Insert: {
          company_id: string
          created_at?: string
          period_key: string
          task: string
        }
        Update: {
          company_id?: string
          created_at?: string
          period_key?: string
          task?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_sweep_claims_company_id_fkey"
            columns: ["company_id"]
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      material_recipes: {
        Row: {
          company_id: string
          created_at: string
          est_unit_cost_cents: number | null
          id: string
          label: string
          organization_id: string
          qty_per_unit: number
          service_catalog_item_id: string
          sort_order: number
          supplier_id: string | null
          unit: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          company_id: string
          created_at?: string
          est_unit_cost_cents?: number | null
          id?: string
          label: string
          organization_id: string
          qty_per_unit: number
          service_catalog_item_id: string
          sort_order?: number
          supplier_id?: string | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          est_unit_cost_cents?: number | null
          id?: string
          label?: string
          organization_id?: string
          qty_per_unit?: number
          service_catalog_item_id?: string
          sort_order?: number
          supplier_id?: string | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_recipes_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "material_recipes_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_recipes_service_catalog_item_id_fkey"
            columns: ["service_catalog_item_id"]
            referencedRelation: "service_catalog_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_recipes_supplier_id_fkey"
            columns: ["supplier_id"]
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      member_pay_rates: {
        Row: {
          hourly_cost_cents: number
          organization_id: string
          profile_id: string
          updated_at: string
          updated_by: string | null
        }
        ComputedFields: never
        Insert: {
          hourly_cost_cents: number
          organization_id: string
          profile_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          hourly_cost_cents?: number
          organization_id?: string
          profile_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_pay_rates_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_pay_rates_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_pay_rates_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "member_pay_rates_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
          {
            foreignKeyName: "member_pay_rates_updated_by_fkey"
            columns: ["updated_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_pay_rates_updated_by_fkey"
            columns: ["updated_by"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "member_pay_rates_updated_by_fkey"
            columns: ["updated_by"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
        ]
      }
      message_log: {
        Row: {
          body: string | null
          channel: string
          company_id: string | null
          contact_id: string | null
          created_at: string
          direction: string
          error: string | null
          from_addr: string | null
          id: string
          media: Json | null
          organization_id: string
          provider: string | null
          provider_ref: string | null
          sent_by: string | null
          status: string
          subject: string | null
          to_addr: string | null
          workflow_run_id: string | null
        }
        ComputedFields: never
        Insert: {
          body?: string | null
          channel: string
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          direction: string
          error?: string | null
          from_addr?: string | null
          id?: string
          media?: Json | null
          organization_id: string
          provider?: string | null
          provider_ref?: string | null
          sent_by?: string | null
          status: string
          subject?: string | null
          to_addr?: string | null
          workflow_run_id?: string | null
        }
        Update: {
          body?: string | null
          channel?: string
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          direction?: string
          error?: string | null
          from_addr?: string | null
          id?: string
          media?: Json | null
          organization_id?: string
          provider?: string | null
          provider_ref?: string | null
          sent_by?: string | null
          status?: string
          subject?: string | null
          to_addr?: string | null
          workflow_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_log_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      missed_calls: {
        Row: {
          ai_followup_at: string | null
          ai_handoff_at: string | null
          ai_released_at: string | null
          ai_retell_call_id: string | null
          ai_urgent_alerted_at: string | null
          call_sid: string
          caller_name: string | null
          caller_phone_last10: string | null
          company_id: string
          contact_id: string | null
          created_at: string
          forwarded_from: string | null
          from_number: string | null
          id: string
          lead_id: string | null
          organization_id: string
          owner_alerted_at: string | null
          provider: string
          raw_payload: Json
          recording_duration_seconds: number | null
          recording_sid: string | null
          recording_url: string | null
          text_back_status: string
          to_number: string | null
          transcription_sid: string | null
          transcription_status: string | null
          transcription_text: string | null
          updated_at: string
          voicemail_at: string | null
        }
        ComputedFields: never
        Insert: {
          ai_followup_at?: string | null
          ai_handoff_at?: string | null
          ai_released_at?: string | null
          ai_retell_call_id?: string | null
          ai_urgent_alerted_at?: string | null
          call_sid: string
          caller_name?: string | null
          caller_phone_last10?: string | null
          company_id: string
          contact_id?: string | null
          created_at?: string
          forwarded_from?: string | null
          from_number?: string | null
          id?: string
          lead_id?: string | null
          organization_id: string
          owner_alerted_at?: string | null
          provider?: string
          raw_payload?: Json
          recording_duration_seconds?: number | null
          recording_sid?: string | null
          recording_url?: string | null
          text_back_status?: string
          to_number?: string | null
          transcription_sid?: string | null
          transcription_status?: string | null
          transcription_text?: string | null
          updated_at?: string
          voicemail_at?: string | null
        }
        Update: {
          ai_followup_at?: string | null
          ai_handoff_at?: string | null
          ai_released_at?: string | null
          ai_retell_call_id?: string | null
          ai_urgent_alerted_at?: string | null
          call_sid?: string
          caller_name?: string | null
          caller_phone_last10?: string | null
          company_id?: string
          contact_id?: string | null
          created_at?: string
          forwarded_from?: string | null
          from_number?: string | null
          id?: string
          lead_id?: string | null
          organization_id?: string
          owner_alerted_at?: string | null
          provider?: string
          raw_payload?: Json
          recording_duration_seconds?: number | null
          recording_sid?: string | null
          recording_url?: string | null
          text_back_status?: string
          to_number?: string | null
          transcription_sid?: string | null
          transcription_status?: string | null
          transcription_text?: string | null
          updated_at?: string
          voicemail_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "missed_calls_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "missed_calls_contact_id_organization_id_fkey"
            columns: ["contact_id", "organization_id"]
            referencedRelation: "contacts"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "missed_calls_contact_id_organization_id_fkey"
            columns: ["contact_id", "organization_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "missed_calls_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      money_alert_items: {
        Row: {
          alert_date: string
          company_id: string
          created_at: string
          id: string
          item_key: string
          organization_id: string
        }
        ComputedFields: never
        Insert: {
          alert_date: string
          company_id: string
          created_at?: string
          id?: string
          item_key: string
          organization_id: string
        }
        Update: {
          alert_date?: string
          company_id?: string
          created_at?: string
          id?: string
          item_key?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "money_alert_items_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "money_alert_items_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      money_alerts: {
        Row: {
          alert_date: string
          body: string | null
          company_id: string
          created_at: string
          id: string
          items: Json
          last_error: string | null
          organization_id: string
          sent_at: string | null
          status: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          alert_date: string
          body?: string | null
          company_id: string
          created_at?: string
          id?: string
          items?: Json
          last_error?: string | null
          organization_id: string
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          alert_date?: string
          body?: string | null
          company_id?: string
          created_at?: string
          id?: string
          items?: Json
          last_error?: string | null
          organization_id?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "money_alerts_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "money_alerts_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_scorecard_notes: {
        Row: {
          company_id: string
          created_at: string
          id: string
          month: string
          note: string
          organization_id: string
          updated_at: string
          updated_by: string | null
        }
        ComputedFields: never
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          month: string
          note: string
          organization_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          month?: string
          note?: string
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "monthly_scorecard_notes_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "monthly_scorecard_notes_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_scorecard_notes_updated_by_fkey"
            columns: ["updated_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_scorecard_notes_updated_by_fkey"
            columns: ["updated_by"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "monthly_scorecard_notes_updated_by_fkey"
            columns: ["updated_by"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
        ]
      }
      monthly_scorecard_sends: {
        Row: {
          company_id: string
          created_at: string
          detail: Json
          email_status: string | null
          id: string
          month: string
          organization_id: string
          recipient: string | null
          send_count: number
          sent_at: string | null
          status: string
          subject: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          company_id: string
          created_at?: string
          detail?: Json
          email_status?: string | null
          id?: string
          month: string
          organization_id: string
          recipient?: string | null
          send_count?: number
          sent_at?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          detail?: Json
          email_status?: string | null
          id?: string
          month?: string
          organization_id?: string
          recipient?: string | null
          send_count?: number
          sent_at?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_scorecard_sends_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "monthly_scorecard_sends_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          conflicts: boolean
          daily_digest: boolean
          drafts: boolean
          leads: boolean
          organization_id: string
          payments: boolean
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          timezone: string | null
          updated_at: string
          user_id: string
          workflow_failures: boolean
        }
        ComputedFields: never
        Insert: {
          conflicts?: boolean
          daily_digest?: boolean
          drafts?: boolean
          leads?: boolean
          organization_id: string
          payments?: boolean
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          timezone?: string | null
          updated_at?: string
          user_id: string
          workflow_failures?: boolean
        }
        Update: {
          conflicts?: boolean
          daily_digest?: boolean
          drafts?: boolean
          leads?: boolean
          organization_id?: string
          payments?: boolean
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          timezone?: string | null
          updated_at?: string
          user_id?: string
          workflow_failures?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      number_port_requests: {
        Row: {
          account_number_enc: string | null
          account_number_last4: string | null
          attached_numbers: string[]
          authorized_name: string | null
          bill_content_type: string | null
          bill_path: string | null
          bill_uploaded_at: string | null
          business_name: string | null
          cancelled_at: string | null
          carrier: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          created_via: string
          foc_date: string | null
          foc_set_at: string | null
          id: string
          last_checked_at: string | null
          loa_path: string | null
          loa_sha256: string | null
          loa_signed_at: string | null
          loa_signed_ip: string | null
          loa_signed_name: string | null
          loa_signed_user_agent: string | null
          notified_status: string | null
          notify_status: string | null
          numbers: string[]
          operator_opened_at: string | null
          organization_id: string
          pin_enc: string | null
          pin_status: string
          preexisting_numbers: string[]
          ready_at: string | null
          rejected_at: string | null
          rejection_reason: string | null
          secrets_purged_at: string | null
          service_address: Json | null
          status: string
          submitted_at: string | null
          token: string
          twilio_port_request_id: string | null
          twilio_snapshot_at: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          account_number_enc?: string | null
          account_number_last4?: string | null
          attached_numbers?: string[]
          authorized_name?: string | null
          bill_content_type?: string | null
          bill_path?: string | null
          bill_uploaded_at?: string | null
          business_name?: string | null
          cancelled_at?: string | null
          carrier?: string | null
          company_id: string
          completed_at?: string | null
          created_at?: string
          created_via?: string
          foc_date?: string | null
          foc_set_at?: string | null
          id?: string
          last_checked_at?: string | null
          loa_path?: string | null
          loa_sha256?: string | null
          loa_signed_at?: string | null
          loa_signed_ip?: string | null
          loa_signed_name?: string | null
          loa_signed_user_agent?: string | null
          notified_status?: string | null
          notify_status?: string | null
          numbers?: string[]
          operator_opened_at?: string | null
          organization_id: string
          pin_enc?: string | null
          pin_status?: string
          preexisting_numbers?: string[]
          ready_at?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          secrets_purged_at?: string | null
          service_address?: Json | null
          status?: string
          submitted_at?: string | null
          token: string
          twilio_port_request_id?: string | null
          twilio_snapshot_at?: string | null
          updated_at?: string
        }
        Update: {
          account_number_enc?: string | null
          account_number_last4?: string | null
          attached_numbers?: string[]
          authorized_name?: string | null
          bill_content_type?: string | null
          bill_path?: string | null
          bill_uploaded_at?: string | null
          business_name?: string | null
          cancelled_at?: string | null
          carrier?: string | null
          company_id?: string
          completed_at?: string | null
          created_at?: string
          created_via?: string
          foc_date?: string | null
          foc_set_at?: string | null
          id?: string
          last_checked_at?: string | null
          loa_path?: string | null
          loa_sha256?: string | null
          loa_signed_at?: string | null
          loa_signed_ip?: string | null
          loa_signed_name?: string | null
          loa_signed_user_agent?: string | null
          notified_status?: string | null
          notify_status?: string | null
          numbers?: string[]
          operator_opened_at?: string | null
          organization_id?: string
          pin_enc?: string | null
          pin_status?: string
          preexisting_numbers?: string[]
          ready_at?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          secrets_purged_at?: string | null
          service_address?: Json | null
          status?: string
          submitted_at?: string | null
          token?: string
          twilio_port_request_id?: string | null
          twilio_snapshot_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "number_port_requests_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "number_port_requests_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_events: {
        Row: {
          company_id: string | null
          event: string
          id: string
          metadata: Json
          occurred_at: string
          organization_id: string
          step: string
        }
        ComputedFields: never
        Insert: {
          company_id?: string | null
          event: string
          id?: string
          metadata?: Json
          occurred_at?: string
          organization_id: string
          step: string
        }
        Update: {
          company_id?: string | null
          event?: string
          id?: string
          metadata?: Json
          occurred_at?: string
          organization_id?: string
          step?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_events_company_id_fkey"
            columns: ["company_id"]
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_events_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_progress: {
        Row: {
          company_id: string
          completed_at: string | null
          created_at: string
          data: Json
          id: string
          organization_id: string
          status: string
          step: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          company_id: string
          completed_at?: string | null
          created_at?: string
          data?: Json
          id?: string
          organization_id: string
          status?: string
          step: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          created_at?: string
          data?: Json
          id?: string
          organization_id?: string
          status?: string
          step?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_progress_company_id_fkey"
            columns: ["company_id"]
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_progress_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      operator_actions: {
        Row: {
          action: string
          company_id: string | null
          created_at: string
          detail: Json
          id: string
          operator_email: string
          organization_id: string | null
        }
        ComputedFields: never
        Insert: {
          action: string
          company_id?: string | null
          created_at?: string
          detail?: Json
          id?: string
          operator_email: string
          organization_id?: string | null
        }
        Update: {
          action?: string
          company_id?: string | null
          created_at?: string
          detail?: Json
          id?: string
          operator_email?: string
          organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operator_actions_company_id_fkey"
            columns: ["company_id"]
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operator_actions_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      operator_health_reports: {
        Row: {
          all_clear: boolean
          created_at: string
          error: string | null
          guarantee_at_risk: number
          id: string
          item_count: number
          report_date: string
          sent_at: string | null
          status: string
          subject: string | null
          summary: Json
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          all_clear?: boolean
          created_at?: string
          error?: string | null
          guarantee_at_risk?: number
          id?: string
          item_count?: number
          report_date: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          summary?: Json
          updated_at?: string
        }
        Update: {
          all_clear?: boolean
          created_at?: string
          error?: string | null
          guarantee_at_risk?: number
          id?: string
          item_count?: number
          report_date?: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          summary?: Json
          updated_at?: string
        }
        Relationships: []
      }
      organization_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by_profile_id: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by_profile_id: string | null
          organization_id: string
          role: Database["public"]["Enums"]["membership_role"]
          status: string
          token: string
        }
        ComputedFields: never
        Insert: {
          accepted_at?: string | null
          accepted_by_profile_id?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by_profile_id?: string | null
          organization_id: string
          role?: Database["public"]["Enums"]["membership_role"]
          status?: string
          token: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by_profile_id?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by_profile_id?: string | null
          organization_id?: string
          role?: Database["public"]["Enums"]["membership_role"]
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invitations_accepted_by_profile_id_fkey"
            columns: ["accepted_by_profile_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_invitations_accepted_by_profile_id_fkey"
            columns: ["accepted_by_profile_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "organization_invitations_accepted_by_profile_id_fkey"
            columns: ["accepted_by_profile_id"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
          {
            foreignKeyName: "organization_invitations_invited_by_profile_id_fkey"
            columns: ["invited_by_profile_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_invitations_invited_by_profile_id_fkey"
            columns: ["invited_by_profile_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "organization_invitations_invited_by_profile_id_fkey"
            columns: ["invited_by_profile_id"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
          {
            foreignKeyName: "organization_invitations_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_memberships: {
        Row: {
          created_at: string
          id: string
          joined_at: string
          organization_id: string
          phone_e164: string | null
          profile_id: string
          role: Database["public"]["Enums"]["membership_role"]
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          id?: string
          joined_at?: string
          organization_id: string
          phone_e164?: string | null
          profile_id: string
          role?: Database["public"]["Enums"]["membership_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          joined_at?: string
          organization_id?: string
          phone_e164?: string | null
          profile_id?: string
          role?: Database["public"]["Enums"]["membership_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_memberships_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memberships_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memberships_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "organization_memberships_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
        ]
      }
      organizations: {
        Row: {
          billing_email: string | null
          crankleads_tier: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          plan: string
          platform_brand: string
          slug: string
          stripe_customer_id: string | null
          subscription_status: string
          trial_ends_at: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          billing_email?: string | null
          crankleads_tier?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          plan?: string
          platform_brand?: string
          slug: string
          stripe_customer_id?: string | null
          subscription_status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          billing_email?: string | null
          crankleads_tier?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          plan?: string
          platform_brand?: string
          slug?: string
          stripe_customer_id?: string | null
          subscription_status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizations_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "organizations_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
        ]
      }
      owner_approvals: {
        Row: {
          company_id: string
          contact_id: string | null
          conversation_id: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decided_via: string | null
          execution_claimed_at: string | null
          expires_at: string | null
          id: string
          kind: string
          notified_at: string | null
          notified_to: string | null
          organization_id: string
          payload: Json
          requested_by: string
          result: Json | null
          short_code: number | null
          status: string
          summary: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          company_id: string
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decided_via?: string | null
          execution_claimed_at?: string | null
          expires_at?: string | null
          id?: string
          kind: string
          notified_at?: string | null
          notified_to?: string | null
          organization_id: string
          payload?: Json
          requested_by?: string
          result?: Json | null
          short_code?: number | null
          status?: string
          summary: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decided_via?: string | null
          execution_claimed_at?: string | null
          expires_at?: string | null
          id?: string
          kind?: string
          notified_at?: string | null
          notified_to?: string | null
          organization_id?: string
          payload?: Json
          requested_by?: string
          result?: Json | null
          short_code?: number | null
          status?: string
          summary?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_approvals_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "owner_approvals_contact_id_fkey"
            columns: ["contact_id"]
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_approvals_contact_id_fkey"
            columns: ["contact_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_approvals_conversation_id_fkey"
            columns: ["conversation_id"]
            referencedRelation: "sms_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_approvals_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_briefings: {
        Row: {
          attempts: number
          body: string | null
          company_id: string
          created_at: string
          email_status: string | null
          id: string
          last_attempt_at: string | null
          last_error: string | null
          local_date: string
          money_fold: string | null
          money_items: Json
          organization_id: string
          sent_at: string | null
          status: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          attempts?: number
          body?: string | null
          company_id: string
          created_at?: string
          email_status?: string | null
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          local_date: string
          money_fold?: string | null
          money_items?: Json
          organization_id: string
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          body?: string | null
          company_id?: string
          created_at?: string
          email_status?: string | null
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          local_date?: string
          money_fold?: string | null
          money_items?: Json
          organization_id?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_briefings_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "owner_briefings_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_call_requests: {
        Row: {
          approval_id: string | null
          brief: Json
          claimed_at: string | null
          claimed_by: string | null
          company_id: string
          contact_id: string
          created_at: string
          id: string
          last_error: string | null
          organization_id: string
          outcome: Json | null
          owner_notified_at: string | null
          placed_at: string | null
          requested_by_phone: string
          retell_call_id: string | null
          run_at: string
          status: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          approval_id?: string | null
          brief?: Json
          claimed_at?: string | null
          claimed_by?: string | null
          company_id: string
          contact_id: string
          created_at?: string
          id?: string
          last_error?: string | null
          organization_id: string
          outcome?: Json | null
          owner_notified_at?: string | null
          placed_at?: string | null
          requested_by_phone: string
          retell_call_id?: string | null
          run_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          approval_id?: string | null
          brief?: Json
          claimed_at?: string | null
          claimed_by?: string | null
          company_id?: string
          contact_id?: string
          created_at?: string
          id?: string
          last_error?: string | null
          organization_id?: string
          outcome?: Json | null
          owner_notified_at?: string | null
          placed_at?: string | null
          requested_by_phone?: string
          retell_call_id?: string | null
          run_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_call_requests_approval_id_fkey"
            columns: ["approval_id"]
            referencedRelation: "owner_approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_call_requests_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "owner_call_requests_contact_id_organization_id_fkey"
            columns: ["contact_id", "organization_id"]
            referencedRelation: "contacts"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "owner_call_requests_contact_id_organization_id_fkey"
            columns: ["contact_id", "organization_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "owner_call_requests_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_command_log: {
        Row: {
          body: string | null
          company_id: string | null
          created_at: string
          from_phone: string
          id: string
          intent: string | null
          organization_id: string | null
          provider_ref: string | null
          result: Json
          to_phone: string | null
        }
        ComputedFields: never
        Insert: {
          body?: string | null
          company_id?: string | null
          created_at?: string
          from_phone: string
          id?: string
          intent?: string | null
          organization_id?: string | null
          provider_ref?: string | null
          result?: Json
          to_phone?: string | null
        }
        Update: {
          body?: string | null
          company_id?: string | null
          created_at?: string
          from_phone?: string
          id?: string
          intent?: string | null
          organization_id?: string | null
          provider_ref?: string | null
          result?: Json
          to_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "owner_command_log_company_id_fkey"
            columns: ["company_id"]
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_command_log_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_digest_sends: {
        Row: {
          channels_sent: string[]
          company_id: string
          created_at: string
          detail: Json
          email_status: string | null
          id: string
          local_date: string
          organization_id: string
          sms_status: string | null
        }
        ComputedFields: never
        Insert: {
          channels_sent?: string[]
          company_id: string
          created_at?: string
          detail?: Json
          email_status?: string | null
          id?: string
          local_date: string
          organization_id: string
          sms_status?: string | null
        }
        Update: {
          channels_sent?: string[]
          company_id?: string
          created_at?: string
          detail?: Json
          email_status?: string | null
          id?: string
          local_date?: string
          organization_id?: string
          sms_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "owner_digest_sends_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "owner_digest_sends_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_phone_verifications: {
        Row: {
          attempts: number
          code_hash: string
          company_id: string
          created_at: string
          expires_at: string
          id: string
          organization_id: string
          phone_e164: string
          requested_by: string | null
          verified_at: string | null
        }
        ComputedFields: never
        Insert: {
          attempts?: number
          code_hash: string
          company_id: string
          created_at?: string
          expires_at: string
          id?: string
          organization_id: string
          phone_e164: string
          requested_by?: string | null
          verified_at?: string | null
        }
        Update: {
          attempts?: number
          code_hash?: string
          company_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          organization_id?: string
          phone_e164?: string
          requested_by?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "owner_phone_verifications_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "owner_phone_verifications_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pay_period_events: {
        Row: {
          action: string
          actor: string
          company_id: string
          created_at: string
          detail: Json
          id: string
          organization_id: string
          period_id: string
        }
        ComputedFields: never
        Insert: {
          action: string
          actor: string
          company_id: string
          created_at?: string
          detail?: Json
          id?: string
          organization_id: string
          period_id: string
        }
        Update: {
          action?: string
          actor?: string
          company_id?: string
          created_at?: string
          detail?: Json
          id?: string
          organization_id?: string
          period_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pay_period_events_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "pay_period_events_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pay_period_events_period_id_fkey"
            columns: ["period_id"]
            referencedRelation: "pay_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      pay_periods: {
        Row: {
          approval_id: string | null
          company_id: string
          covers_general_time: boolean
          created_at: string
          csv_email_error: string | null
          csv_emailed_at: string | null
          csv_emailed_to: string | null
          end_date: string
          ends_at: string
          frequency: string
          id: string
          locked_at: string | null
          locked_by: string | null
          locked_via: string | null
          locked_with_open_entries: boolean
          open_entries: number
          organization_id: string
          ot_minutes: number
          people: number
          start_date: string
          starts_at: string
          status: string
          total_minutes: number
          unlock_reason: string | null
          unlocked_at: string | null
          unlocked_by: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          approval_id?: string | null
          company_id: string
          covers_general_time?: boolean
          created_at?: string
          csv_email_error?: string | null
          csv_emailed_at?: string | null
          csv_emailed_to?: string | null
          end_date: string
          ends_at: string
          frequency: string
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          locked_via?: string | null
          locked_with_open_entries?: boolean
          open_entries?: number
          organization_id: string
          ot_minutes?: number
          people?: number
          start_date: string
          starts_at: string
          status?: string
          total_minutes?: number
          unlock_reason?: string | null
          unlocked_at?: string | null
          unlocked_by?: string | null
          updated_at?: string
        }
        Update: {
          approval_id?: string | null
          company_id?: string
          covers_general_time?: boolean
          created_at?: string
          csv_email_error?: string | null
          csv_emailed_at?: string | null
          csv_emailed_to?: string | null
          end_date?: string
          ends_at?: string
          frequency?: string
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          locked_via?: string | null
          locked_with_open_entries?: boolean
          open_entries?: number
          organization_id?: string
          ot_minutes?: number
          people?: number
          start_date?: string
          starts_at?: string
          status?: string
          total_minutes?: number
          unlock_reason?: string | null
          unlocked_at?: string | null
          unlocked_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pay_periods_approval_id_fkey"
            columns: ["approval_id"]
            referencedRelation: "owner_approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pay_periods_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "pay_periods_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pay_periods_unlocked_by_fkey"
            columns: ["unlocked_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pay_periods_unlocked_by_fkey"
            columns: ["unlocked_by"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "pay_periods_unlocked_by_fkey"
            columns: ["unlocked_by"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
        ]
      }
      payment_plans: {
        Row: {
          activated_at: string
          approval_id: string | null
          company_id: string
          completed_at: string | null
          contact_id: string | null
          created_at: string
          id: string
          instalments: Json
          invoice_id: string
          organization_id: string
          starting_balance_cents: number
          status: string
          total_cents: number
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          activated_at?: string
          approval_id?: string | null
          company_id: string
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          id?: string
          instalments?: Json
          invoice_id: string
          organization_id: string
          starting_balance_cents: number
          status?: string
          total_cents: number
          updated_at?: string
        }
        Update: {
          activated_at?: string
          approval_id?: string | null
          company_id?: string
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          id?: string
          instalments?: Json
          invoice_id?: string
          organization_id?: string
          starting_balance_cents?: number
          status?: string
          total_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_plans_approval_id_fkey"
            columns: ["approval_id"]
            referencedRelation: "owner_approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_plans_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "payment_plans_contact_id_fkey"
            columns: ["contact_id"]
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_plans_contact_id_fkey"
            columns: ["contact_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_plans_invoice_id_fkey"
            columns: ["invoice_id"]
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_plans_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_sms_opt_outs: {
        Row: {
          created_at: string
          opted_in_at: string | null
          opted_out_at: string | null
          phone_e164: string
          source_ref: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          opted_in_at?: string | null
          opted_out_at?: string | null
          phone_e164: string
          source_ref?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          opted_in_at?: string | null
          opted_out_at?: string | null
          phone_e164?: string
          source_ref?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      price_changes: {
        Row: {
          applied_at: string | null
          approval_id: string | null
          basis: Json
          company_id: string
          created_at: string
          decided_at: string | null
          id: string
          item_label: string
          new_minimum_cents: number
          new_rate_cents: number
          old_minimum_cents: number
          old_rate_cents: number
          organization_id: string
          pct: number
          pricing_type: string
          result: string | null
          run_key: string | null
          service_catalog_item_id: string | null
          status: string
          unit_label: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          applied_at?: string | null
          approval_id?: string | null
          basis?: Json
          company_id: string
          created_at?: string
          decided_at?: string | null
          id?: string
          item_label: string
          new_minimum_cents?: number
          new_rate_cents: number
          old_minimum_cents?: number
          old_rate_cents: number
          organization_id: string
          pct: number
          pricing_type?: string
          result?: string | null
          run_key?: string | null
          service_catalog_item_id?: string | null
          status?: string
          unit_label?: string | null
          updated_at?: string
        }
        Update: {
          applied_at?: string | null
          approval_id?: string | null
          basis?: Json
          company_id?: string
          created_at?: string
          decided_at?: string | null
          id?: string
          item_label?: string
          new_minimum_cents?: number
          new_rate_cents?: number
          old_minimum_cents?: number
          old_rate_cents?: number
          organization_id?: string
          pct?: number
          pricing_type?: string
          result?: string | null
          run_key?: string | null
          service_catalog_item_id?: string | null
          status?: string
          unit_label?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_changes_approval_id_fkey"
            columns: ["approval_id"]
            referencedRelation: "owner_approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_changes_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "price_changes_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_changes_service_catalog_item_id_fkey"
            columns: ["service_catalog_item_id"]
            referencedRelation: "service_catalog_items"
            referencedColumns: ["id"]
          },
        ]
      }
      price_watch: {
        Row: {
          changed_at: string | null
          company_id: string
          created_at: string
          id: string
          minimum_cents: number
          organization_id: string
          rate_cents: number
          seen_at: string
          service_catalog_item_id: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          changed_at?: string | null
          company_id: string
          created_at?: string
          id?: string
          minimum_cents?: number
          organization_id: string
          rate_cents: number
          seen_at?: string
          service_catalog_item_id: string
          updated_at?: string
        }
        Update: {
          changed_at?: string | null
          company_id?: string
          created_at?: string
          id?: string
          minimum_cents?: number
          organization_id?: string
          rate_cents?: number
          seen_at?: string
          service_catalog_item_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_watch_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "price_watch_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_watch_service_catalog_item_id_fkey"
            columns: ["service_catalog_item_id"]
            referencedRelation: "service_catalog_items"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          default_organization_id: string | null
          email: string
          full_name: string | null
          id: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          avatar_url?: string | null
          created_at?: string
          default_organization_id?: string | null
          email: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          default_organization_id?: string | null
          email?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_default_organization_id_fkey"
            columns: ["default_organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profit_advisor_runs: {
        Row: {
          attempts: number
          body: string | null
          company_id: string
          created_at: string
          detail: Json | null
          id: string
          kind: string
          last_error: string | null
          organization_id: string
          run_key: string
          status: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          attempts?: number
          body?: string | null
          company_id: string
          created_at?: string
          detail?: Json | null
          id?: string
          kind: string
          last_error?: string | null
          organization_id: string
          run_key: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          body?: string | null
          company_id?: string
          created_at?: string
          detail?: Json | null
          id?: string
          kind?: string
          last_error?: string | null
          organization_id?: string
          run_key?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profit_advisor_runs_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "profit_advisor_runs_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      public_form_keys: {
        Row: {
          active: boolean
          allowed_origins: string[]
          company_id: string
          created_at: string
          created_by: string | null
          form_type: string
          id: string
          label: string | null
          last_used_at: string | null
          organization_id: string
          public_key: string
        }
        ComputedFields: never
        Insert: {
          active?: boolean
          allowed_origins?: string[]
          company_id: string
          created_at?: string
          created_by?: string | null
          form_type?: string
          id?: string
          label?: string | null
          last_used_at?: string | null
          organization_id: string
          public_key: string
        }
        Update: {
          active?: boolean
          allowed_origins?: string[]
          company_id?: string
          created_at?: string
          created_by?: string | null
          form_type?: string
          id?: string
          label?: string | null
          last_used_at?: string | null
          organization_id?: string
          public_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_form_keys_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "public_form_keys_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_drafts: {
        Row: {
          attempts: number
          booking_id: string
          company_id: string
          created_at: string
          id: string
          last_error: string | null
          organization_id: string
          outcome: string
          purchase_order_id: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          attempts?: number
          booking_id: string
          company_id: string
          created_at?: string
          id?: string
          last_error?: string | null
          organization_id: string
          outcome?: string
          purchase_order_id?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          booking_id?: string
          company_id?: string
          created_at?: string
          id?: string
          last_error?: string | null
          organization_id?: string
          outcome?: string
          purchase_order_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_drafts_booking_id_fkey"
            columns: ["booking_id"]
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_drafts_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "purchase_order_drafts_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_drafts_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          approval_id: string | null
          basis: string
          booking_id: string | null
          cancel_reason: string | null
          company_id: string
          created_at: string
          est_total_cents: number
          fulfilment: string
          id: string
          job_change_notice: string | null
          job_label: string | null
          job_scheduled_for: string | null
          lines: Json
          needed_by: string | null
          notes: string | null
          organization_id: string
          po_number: string
          po_seq: number
          reminder_sent_at: string | null
          send_error: string | null
          sent_at: string | null
          sent_to: string | null
          sent_via: string | null
          source: string
          status: string
          status_changed_at: string | null
          supplier_id: string | null
          supplier_name: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          approval_id?: string | null
          basis?: string
          booking_id?: string | null
          cancel_reason?: string | null
          company_id: string
          created_at?: string
          est_total_cents?: number
          fulfilment?: string
          id?: string
          job_change_notice?: string | null
          job_label?: string | null
          job_scheduled_for?: string | null
          lines?: Json
          needed_by?: string | null
          notes?: string | null
          organization_id: string
          po_number: string
          po_seq: number
          reminder_sent_at?: string | null
          send_error?: string | null
          sent_at?: string | null
          sent_to?: string | null
          sent_via?: string | null
          source?: string
          status?: string
          status_changed_at?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          updated_at?: string
        }
        Update: {
          approval_id?: string | null
          basis?: string
          booking_id?: string | null
          cancel_reason?: string | null
          company_id?: string
          created_at?: string
          est_total_cents?: number
          fulfilment?: string
          id?: string
          job_change_notice?: string | null
          job_label?: string | null
          job_scheduled_for?: string | null
          lines?: Json
          needed_by?: string | null
          notes?: string | null
          organization_id?: string
          po_number?: string
          po_seq?: number
          reminder_sent_at?: string | null
          send_error?: string | null
          sent_at?: string | null
          sent_to?: string | null
          sent_via?: string | null
          source?: string
          status?: string
          status_changed_at?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_approval_id_fkey"
            columns: ["approval_id"]
            referencedRelation: "owner_approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_booking_id_fkey"
            columns: ["booking_id"]
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "purchase_orders_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      purchasing_daily_counts: {
        Row: {
          asked: number
          company_id: string
          created_at: string
          id: string
          local_date: string
          organization_id: string
        }
        ComputedFields: never
        Insert: {
          asked?: number
          company_id: string
          created_at?: string
          id?: string
          local_date: string
          organization_id: string
        }
        Update: {
          asked?: number
          company_id?: string
          created_at?: string
          id?: string
          local_date?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchasing_daily_counts_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "purchasing_daily_counts_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      push_digest_log: {
        Row: {
          digest_date: string
          organization_id: string
          sent_at: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          digest_date: string
          organization_id: string
          sent_at?: string
          user_id: string
        }
        Update: {
          digest_date?: string
          organization_id?: string
          sent_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_digest_log_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_events: {
        Row: {
          actor_profile_id: string | null
          created_at: string
          event_type: string
          id: string
          metadata: Json
          organization_id: string
          quote_id: string
        }
        ComputedFields: never
        Insert: {
          actor_profile_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          organization_id: string
          quote_id: string
        }
        Update: {
          actor_profile_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          organization_id?: string
          quote_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_events_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_events_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "quote_events_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
          {
            foreignKeyName: "quote_events_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_events_quote_id_fkey"
            columns: ["quote_id"]
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_follow_ups: {
        Row: {
          company_id: string
          contact_id: string | null
          created_at: string
          id: string
          last_error: string | null
          last_nudge_at: string | null
          nudges_sent: number
          organization_id: string
          quote_id: string
          stop_reason: string | null
          stopped_at: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          company_id: string
          contact_id?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          last_nudge_at?: string | null
          nudges_sent?: number
          organization_id: string
          quote_id: string
          stop_reason?: string | null
          stopped_at?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          contact_id?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          last_nudge_at?: string | null
          nudges_sent?: number
          organization_id?: string
          quote_id?: string
          stop_reason?: string | null
          stopped_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_follow_ups_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "quote_follow_ups_contact_id_fkey"
            columns: ["contact_id"]
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_follow_ups_contact_id_fkey"
            columns: ["contact_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_follow_ups_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_follow_ups_quote_id_fkey"
            columns: ["quote_id"]
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_number_counters: {
        Row: {
          last_number: number
          organization_id: string
          year: number
        }
        ComputedFields: never
        Insert: {
          last_number?: number
          organization_id: string
          year: number
        }
        Update: {
          last_number?: number
          organization_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_number_counters_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          approved_at: string | null
          approved_by_name: string | null
          approved_deposit_cents: number | null
          approved_ip: unknown
          approved_line_items: Json | null
          approved_subtotal_cents: number | null
          approved_tax_cents: number | null
          approved_total_cents: number | null
          approved_user_agent: string | null
          auto_generated: boolean
          balance_paid_at: string | null
          bundle_id: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          company_id: string | null
          completed_at: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          deposit_cents: number
          deposit_flat_cents: number | null
          deposit_paid_at: string | null
          deposit_rate_bps: number
          expires_at: string | null
          expiry_reminder_sent_at: string | null
          first_viewed_at: string | null
          id: string
          input_snapshot: Json
          intro_message: string | null
          line_items: Json
          notes: string | null
          organization_id: string
          public_token: string
          quote_number: string | null
          sent_at: string | null
          source: string | null
          source_lead_id: string | null
          status: string
          stripe_checkout_session_id: string | null
          stripe_customer_id: string | null
          stripe_invoice_id: string | null
          stripe_payment_intent_id: string | null
          stripe_payment_method_id: string | null
          subtotal_cents: number
          superseded_by: string | null
          supersedes: string | null
          tax_cents: number
          tax_rate_bps: number
          terms_accepted: boolean
          title: string | null
          total_cents: number
          updated_at: string
          valid_until: string | null
        }
        ComputedFields: never
        Insert: {
          approved_at?: string | null
          approved_by_name?: string | null
          approved_deposit_cents?: number | null
          approved_ip?: unknown
          approved_line_items?: Json | null
          approved_subtotal_cents?: number | null
          approved_tax_cents?: number | null
          approved_total_cents?: number | null
          approved_user_agent?: string | null
          auto_generated?: boolean
          balance_paid_at?: string | null
          bundle_id?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          company_id?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deposit_cents?: number
          deposit_flat_cents?: number | null
          deposit_paid_at?: string | null
          deposit_rate_bps?: number
          expires_at?: string | null
          expiry_reminder_sent_at?: string | null
          first_viewed_at?: string | null
          id?: string
          input_snapshot?: Json
          intro_message?: string | null
          line_items?: Json
          notes?: string | null
          organization_id: string
          public_token: string
          quote_number?: string | null
          sent_at?: string | null
          source?: string | null
          source_lead_id?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_payment_method_id?: string | null
          subtotal_cents?: number
          superseded_by?: string | null
          supersedes?: string | null
          tax_cents?: number
          tax_rate_bps?: number
          terms_accepted?: boolean
          title?: string | null
          total_cents?: number
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by_name?: string | null
          approved_deposit_cents?: number | null
          approved_ip?: unknown
          approved_line_items?: Json | null
          approved_subtotal_cents?: number | null
          approved_tax_cents?: number | null
          approved_total_cents?: number | null
          approved_user_agent?: string | null
          auto_generated?: boolean
          balance_paid_at?: string | null
          bundle_id?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          company_id?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deposit_cents?: number
          deposit_flat_cents?: number | null
          deposit_paid_at?: string | null
          deposit_rate_bps?: number
          expires_at?: string | null
          expiry_reminder_sent_at?: string | null
          first_viewed_at?: string | null
          id?: string
          input_snapshot?: Json
          intro_message?: string | null
          line_items?: Json
          notes?: string | null
          organization_id?: string
          public_token?: string
          quote_number?: string | null
          sent_at?: string | null
          source?: string | null
          source_lead_id?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_payment_method_id?: string | null
          subtotal_cents?: number
          superseded_by?: string | null
          supersedes?: string | null
          tax_cents?: number
          tax_rate_bps?: number
          terms_accepted?: boolean
          title?: string | null
          total_cents?: number
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "quotes_contact_id_organization_id_fkey"
            columns: ["contact_id", "organization_id"]
            referencedRelation: "contacts"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "quotes_contact_id_organization_id_fkey"
            columns: ["contact_id", "organization_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "quotes_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "quotes_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
          {
            foreignKeyName: "quotes_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_superseded_by_fkey"
            columns: ["superseded_by"]
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_supersedes_fkey"
            columns: ["supersedes"]
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_buckets: {
        Row: {
          bucket_key: string
          hits: number
          window_started_at: string
        }
        ComputedFields: never
        Insert: {
          bucket_key: string
          hits?: number
          window_started_at?: string
        }
        Update: {
          bucket_key?: string
          hits?: number
          window_started_at?: string
        }
        Relationships: []
      }
      raw_leads: {
        Row: {
          company_id: string | null
          contact_id: string | null
          created_at: string
          form_type: string | null
          id: string
          lead_id: string
          matched: boolean
          needs_attention: boolean
          organization_id: string | null
          raw_payload: Json
          received_at: string | null
          schema_valid: boolean
          schema_version: number | null
          source: string | null
          source_site: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          form_type?: string | null
          id?: string
          lead_id: string
          matched?: boolean
          needs_attention?: boolean
          organization_id?: string | null
          raw_payload: Json
          received_at?: string | null
          schema_valid?: boolean
          schema_version?: number | null
          source?: string | null
          source_site?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          form_type?: string | null
          id?: string
          lead_id?: string
          matched?: boolean
          needs_attention?: boolean
          organization_id?: string | null
          raw_payload?: Json
          received_at?: string | null
          schema_valid?: boolean
          schema_version?: number | null
          source?: string | null
          source_site?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "raw_leads_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "raw_leads_contact_id_organization_id_fkey"
            columns: ["contact_id", "organization_id"]
            referencedRelation: "contacts"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "raw_leads_contact_id_organization_id_fkey"
            columns: ["contact_id", "organization_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "raw_leads_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      rebrand_values_backup: {
        Row: {
          backed_up_at: string
          id: number
          new_value: string | null
          old_value: string | null
          row_id: string | null
          step: string
          target_column: string | null
          target_table: string
        }
        ComputedFields: never
        Insert: {
          backed_up_at?: string
          id?: number
          new_value?: string | null
          old_value?: string | null
          row_id?: string | null
          step: string
          target_column?: string | null
          target_table: string
        }
        Update: {
          backed_up_at?: string
          id?: number
          new_value?: string | null
          old_value?: string | null
          row_id?: string | null
          step?: string
          target_column?: string | null
          target_table?: string
        }
        Relationships: []
      }
      receipt_texts: {
        Row: {
          amount_cents: number | null
          booking_id: string | null
          category: string | null
          company_id: string
          created_at: string
          description: string | null
          duplicate_of: string | null
          expense_id: string | null
          file_path: string | null
          file_type: string | null
          filed_at: string | null
          id: string
          log_id: string
          media_index: number
          missing: string[]
          organization_id: string
          owner_words: string | null
          paid_with: string | null
          po_reference: string | null
          reply: string | null
          spent_on: string | null
          status: string
          tax_cents: number | null
          updated_at: string
          vendor: string | null
        }
        ComputedFields: never
        Insert: {
          amount_cents?: number | null
          booking_id?: string | null
          category?: string | null
          company_id: string
          created_at?: string
          description?: string | null
          duplicate_of?: string | null
          expense_id?: string | null
          file_path?: string | null
          file_type?: string | null
          filed_at?: string | null
          id?: string
          log_id: string
          media_index?: number
          missing?: string[]
          organization_id: string
          owner_words?: string | null
          paid_with?: string | null
          po_reference?: string | null
          reply?: string | null
          spent_on?: string | null
          status?: string
          tax_cents?: number | null
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          amount_cents?: number | null
          booking_id?: string | null
          category?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          duplicate_of?: string | null
          expense_id?: string | null
          file_path?: string | null
          file_type?: string | null
          filed_at?: string | null
          id?: string
          log_id?: string
          media_index?: number
          missing?: string[]
          organization_id?: string
          owner_words?: string | null
          paid_with?: string | null
          po_reference?: string | null
          reply?: string | null
          spent_on?: string | null
          status?: string
          tax_cents?: number | null
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receipt_texts_booking_id_fkey"
            columns: ["booking_id"]
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_texts_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "receipt_texts_duplicate_of_fkey"
            columns: ["duplicate_of"]
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_texts_expense_id_fkey"
            columns: ["expense_id"]
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_texts_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      recruiter_sweep_claims: {
        Row: {
          company_id: string
          created_at: string
          period_key: string
          task: string
        }
        ComputedFields: never
        Insert: {
          company_id: string
          created_at?: string
          period_key: string
          task: string
        }
        Update: {
          company_id?: string
          created_at?: string
          period_key?: string
          task?: string
        }
        Relationships: [
          {
            foreignKeyName: "recruiter_sweep_claims_company_id_fkey"
            columns: ["company_id"]
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_jobs: {
        Row: {
          checklist_template_id: string | null
          company_id: string
          contact_id: string | null
          created_at: string
          created_by: string | null
          crew_profile_ids: string[]
          description: string | null
          duration_minutes: number
          ends_on: string | null
          frequency: string
          generated_through: string | null
          id: string
          interval_count: number
          line_items: Json
          location: string | null
          max_occurrences: number | null
          organization_id: string
          start_date: string
          status: string
          time_of_day: string
          title: string
          updated_at: string
          visit_dates: string[] | null
          weekdays: number[]
        }
        ComputedFields: never
        Insert: {
          checklist_template_id?: string | null
          company_id: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          crew_profile_ids?: string[]
          description?: string | null
          duration_minutes?: number
          ends_on?: string | null
          frequency: string
          generated_through?: string | null
          id?: string
          interval_count?: number
          line_items?: Json
          location?: string | null
          max_occurrences?: number | null
          organization_id: string
          start_date: string
          status?: string
          time_of_day: string
          title: string
          updated_at?: string
          visit_dates?: string[] | null
          weekdays?: number[]
        }
        Update: {
          checklist_template_id?: string | null
          company_id?: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          crew_profile_ids?: string[]
          description?: string | null
          duration_minutes?: number
          ends_on?: string | null
          frequency?: string
          generated_through?: string | null
          id?: string
          interval_count?: number
          line_items?: Json
          location?: string | null
          max_occurrences?: number | null
          organization_id?: string
          start_date?: string
          status?: string
          time_of_day?: string
          title?: string
          updated_at?: string
          visit_dates?: string[] | null
          weekdays?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "recurring_jobs_checklist_template_id_fkey"
            columns: ["checklist_template_id"]
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_jobs_company_id_fkey"
            columns: ["company_id"]
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_jobs_contact_id_fkey"
            columns: ["contact_id"]
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_jobs_contact_id_fkey"
            columns: ["contact_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_jobs_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_jobs_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "recurring_jobs_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
          {
            foreignKeyName: "recurring_jobs_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      rentals: {
        Row: {
          booking_id: string | null
          company_id: string
          created_at: string
          created_via: string
          due_back_at: string | null
          id: string
          item: string
          notes: string | null
          organization_id: string
          out_at: string | null
          rate_cents_per_day: number | null
          returned_at: string | null
          updated_at: string
          vendor: string | null
          vendor_phone: string | null
        }
        ComputedFields: never
        Insert: {
          booking_id?: string | null
          company_id: string
          created_at?: string
          created_via?: string
          due_back_at?: string | null
          id?: string
          item: string
          notes?: string | null
          organization_id: string
          out_at?: string | null
          rate_cents_per_day?: number | null
          returned_at?: string | null
          updated_at?: string
          vendor?: string | null
          vendor_phone?: string | null
        }
        Update: {
          booking_id?: string | null
          company_id?: string
          created_at?: string
          created_via?: string
          due_back_at?: string | null
          id?: string
          item?: string
          notes?: string | null
          organization_id?: string
          out_at?: string | null
          rate_cents_per_day?: number | null
          returned_at?: string | null
          updated_at?: string
          vendor?: string | null
          vendor_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rentals_booking_id_fkey"
            columns: ["booking_id"]
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rentals_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "rentals_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      retell_calls: {
        Row: {
          agent_id: string | null
          call_analysis: Json | null
          call_cost_cents: number | null
          call_id: string
          call_successful: boolean | null
          call_summary: string | null
          caller_phone_last10: string | null
          company_id: string | null
          contact_id: string | null
          cost_breakdown: Json | null
          created_at: string
          custom_analysis_data: Json | null
          direction: string | null
          duration_ms: number | null
          end_timestamp: string | null
          event: string | null
          from_number: string | null
          id: string
          in_voicemail: boolean | null
          is_urgent: boolean
          lead_id: string | null
          organization_id: string | null
          processed_at: string | null
          raw_payload: Json
          received_at: string | null
          recording_url: string | null
          start_timestamp: string | null
          to_number: string | null
          transcript: string | null
          transcript_object: Json | null
          updated_at: string
          user_sentiment: string | null
        }
        ComputedFields: never
        Insert: {
          agent_id?: string | null
          call_analysis?: Json | null
          call_cost_cents?: number | null
          call_id: string
          call_successful?: boolean | null
          call_summary?: string | null
          caller_phone_last10?: string | null
          company_id?: string | null
          contact_id?: string | null
          cost_breakdown?: Json | null
          created_at?: string
          custom_analysis_data?: Json | null
          direction?: string | null
          duration_ms?: number | null
          end_timestamp?: string | null
          event?: string | null
          from_number?: string | null
          id?: string
          in_voicemail?: boolean | null
          is_urgent?: boolean
          lead_id?: string | null
          organization_id?: string | null
          processed_at?: string | null
          raw_payload: Json
          received_at?: string | null
          recording_url?: string | null
          start_timestamp?: string | null
          to_number?: string | null
          transcript?: string | null
          transcript_object?: Json | null
          updated_at?: string
          user_sentiment?: string | null
        }
        Update: {
          agent_id?: string | null
          call_analysis?: Json | null
          call_cost_cents?: number | null
          call_id?: string
          call_successful?: boolean | null
          call_summary?: string | null
          caller_phone_last10?: string | null
          company_id?: string | null
          contact_id?: string | null
          cost_breakdown?: Json | null
          created_at?: string
          custom_analysis_data?: Json | null
          direction?: string | null
          duration_ms?: number | null
          end_timestamp?: string | null
          event?: string | null
          from_number?: string | null
          id?: string
          in_voicemail?: boolean | null
          is_urgent?: boolean
          lead_id?: string | null
          organization_id?: string | null
          processed_at?: string | null
          raw_payload?: Json
          received_at?: string | null
          recording_url?: string | null
          start_timestamp?: string | null
          to_number?: string | null
          transcript?: string | null
          transcript_object?: Json | null
          updated_at?: string
          user_sentiment?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "retell_calls_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "retell_calls_contact_id_organization_id_fkey"
            columns: ["contact_id", "organization_id"]
            referencedRelation: "contacts"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "retell_calls_contact_id_organization_id_fkey"
            columns: ["contact_id", "organization_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "retell_calls_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      review_requests: {
        Row: {
          booking_id: string | null
          channel: string | null
          click_count: number
          clicked_at: string | null
          company_id: string
          contact_id: string
          created_at: string
          created_by: string | null
          id: string
          invoice_id: string | null
          last_clicked_at: string | null
          organization_id: string
          reason: string | null
          scheduled_for: string
          sent_at: string | null
          sent_to: string | null
          source: string
          status: string
          token: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          booking_id?: string | null
          channel?: string | null
          click_count?: number
          clicked_at?: string | null
          company_id: string
          contact_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id?: string | null
          last_clicked_at?: string | null
          organization_id: string
          reason?: string | null
          scheduled_for: string
          sent_at?: string | null
          sent_to?: string | null
          source: string
          status?: string
          token: string
          updated_at?: string
        }
        Update: {
          booking_id?: string | null
          channel?: string | null
          click_count?: number
          clicked_at?: string | null
          company_id?: string
          contact_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id?: string | null
          last_clicked_at?: string | null
          organization_id?: string
          reason?: string | null
          scheduled_for?: string
          sent_at?: string | null
          sent_to?: string | null
          source?: string
          status?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_requests_booking_id_fkey"
            columns: ["booking_id"]
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_requests_company_id_fkey"
            columns: ["company_id"]
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_requests_contact_id_fkey"
            columns: ["contact_id"]
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_requests_contact_id_fkey"
            columns: ["contact_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_requests_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_requests_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "review_requests_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
          {
            foreignKeyName: "review_requests_invoice_id_fkey"
            columns: ["invoice_id"]
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_requests_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      service_agreements: {
        Row: {
          activated_at: string | null
          approval_id: string | null
          billing: string
          cancel_reason: string | null
          cancelled_at: string | null
          company_id: string
          contact_id: string | null
          created_at: string
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          decision_claimed_at: string | null
          id: string
          invoice_ids: string[]
          lapsed_at: string | null
          organization_id: string
          owner_notified_at: string | null
          pending_invoice_id: string | null
          plan_id: string
          plan_name: string
          previous_agreement_id: string | null
          price_cents: number
          recurring_job_id: string | null
          renewal_approval_id: string | null
          renewal_asked_at: string | null
          renewal_declined_at: string | null
          renewal_price_cents: number | null
          renewal_texted_at: string | null
          renewal_token: string | null
          renewed_by_agreement_id: string | null
          service_address: string | null
          sms_consent_at: string | null
          sms_consent_text: string | null
          source: string
          status: string
          term_end: string | null
          term_start: string | null
          updated_at: string
          visit_dates: string[]
          visit_months: number[]
        }
        ComputedFields: never
        Insert: {
          activated_at?: string | null
          approval_id?: string | null
          billing: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          company_id: string
          contact_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          decision_claimed_at?: string | null
          id?: string
          invoice_ids?: string[]
          lapsed_at?: string | null
          organization_id: string
          owner_notified_at?: string | null
          pending_invoice_id?: string | null
          plan_id: string
          plan_name: string
          previous_agreement_id?: string | null
          price_cents: number
          recurring_job_id?: string | null
          renewal_approval_id?: string | null
          renewal_asked_at?: string | null
          renewal_declined_at?: string | null
          renewal_price_cents?: number | null
          renewal_texted_at?: string | null
          renewal_token?: string | null
          renewed_by_agreement_id?: string | null
          service_address?: string | null
          sms_consent_at?: string | null
          sms_consent_text?: string | null
          source?: string
          status?: string
          term_end?: string | null
          term_start?: string | null
          updated_at?: string
          visit_dates?: string[]
          visit_months: number[]
        }
        Update: {
          activated_at?: string | null
          approval_id?: string | null
          billing?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          company_id?: string
          contact_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          decision_claimed_at?: string | null
          id?: string
          invoice_ids?: string[]
          lapsed_at?: string | null
          organization_id?: string
          owner_notified_at?: string | null
          pending_invoice_id?: string | null
          plan_id?: string
          plan_name?: string
          previous_agreement_id?: string | null
          price_cents?: number
          recurring_job_id?: string | null
          renewal_approval_id?: string | null
          renewal_asked_at?: string | null
          renewal_declined_at?: string | null
          renewal_price_cents?: number | null
          renewal_texted_at?: string | null
          renewal_token?: string | null
          renewed_by_agreement_id?: string | null
          service_address?: string | null
          sms_consent_at?: string | null
          sms_consent_text?: string | null
          source?: string
          status?: string
          term_end?: string | null
          term_start?: string | null
          updated_at?: string
          visit_dates?: string[]
          visit_months?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "service_agreements_approval_id_fkey"
            columns: ["approval_id"]
            referencedRelation: "owner_approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_agreements_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "service_agreements_contact_id_fkey"
            columns: ["contact_id"]
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_agreements_contact_id_fkey"
            columns: ["contact_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_agreements_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_agreements_pending_invoice_id_fkey"
            columns: ["pending_invoice_id"]
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_agreements_plan_id_fkey"
            columns: ["plan_id"]
            referencedRelation: "service_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_agreements_previous_agreement_id_fkey"
            columns: ["previous_agreement_id"]
            referencedRelation: "service_agreements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_agreements_recurring_job_id_fkey"
            columns: ["recurring_job_id"]
            referencedRelation: "recurring_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_agreements_renewal_approval_id_fkey"
            columns: ["renewal_approval_id"]
            referencedRelation: "owner_approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_agreements_renewed_by_agreement_id_fkey"
            columns: ["renewed_by_agreement_id"]
            referencedRelation: "service_agreements"
            referencedColumns: ["id"]
          },
        ]
      }
      service_catalog_bundles: {
        Row: {
          active: boolean
          bundle_key: string
          company_id: string
          created_at: string
          discount_pct: number
          id: string
          label: string
          organization_id: string
          service_keys: string[]
          sort_order: number
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          active?: boolean
          bundle_key: string
          company_id: string
          created_at?: string
          discount_pct: number
          id?: string
          label: string
          organization_id: string
          service_keys?: string[]
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          bundle_key?: string
          company_id?: string
          created_at?: string
          discount_pct?: number
          id?: string
          label?: string
          organization_id?: string
          service_keys?: string[]
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_catalog_bundles_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "service_catalog_bundles_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      service_catalog_items: {
        Row: {
          active: boolean
          additional_unit_multiplier: number | null
          additional_unit_rounding: string
          company_id: string
          created_at: string
          description: string | null
          id: string
          label: string
          max_measure: number | null
          max_quantity: number | null
          minimum_cents: number
          modifier_groups: Json | null
          organization_id: string
          pricing_type: string
          rate_bands: Json | null
          rate_cents: number
          review_rules: Json | null
          service_key: string
          sort_order: number
          surcharge_eligible: boolean
          tiers: Json | null
          unit_label: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          active?: boolean
          additional_unit_multiplier?: number | null
          additional_unit_rounding?: string
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          label: string
          max_measure?: number | null
          max_quantity?: number | null
          minimum_cents?: number
          modifier_groups?: Json | null
          organization_id: string
          pricing_type: string
          rate_bands?: Json | null
          rate_cents?: number
          review_rules?: Json | null
          service_key: string
          sort_order?: number
          surcharge_eligible?: boolean
          tiers?: Json | null
          unit_label?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          additional_unit_multiplier?: number | null
          additional_unit_rounding?: string
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          label?: string
          max_measure?: number | null
          max_quantity?: number | null
          minimum_cents?: number
          modifier_groups?: Json | null
          organization_id?: string
          pricing_type?: string
          rate_bands?: Json | null
          rate_cents?: number
          review_rules?: Json | null
          service_key?: string
          sort_order?: number
          surcharge_eligible?: boolean
          tiers?: Json | null
          unit_label?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_catalog_items_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "service_catalog_items_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      service_catalog_surcharges: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          id: string
          label: string
          organization_id: string
          per_measure_cents: number
          updated_at: string
          variant_key: string
        }
        ComputedFields: never
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          id?: string
          label: string
          organization_id: string
          per_measure_cents?: number
          updated_at?: string
          variant_key: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          id?: string
          label?: string
          organization_id?: string
          per_measure_cents?: number
          updated_at?: string
          variant_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_catalog_surcharges_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "service_catalog_surcharges_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      service_plan_messages: {
        Row: {
          agreement_id: string | null
          attempts: number
          body: string
          booking_id: string | null
          company_id: string
          created_at: string
          dedupe_key: string
          error: string | null
          id: string
          kind: string
          not_before: string
          organization_id: string
          sent_at: string | null
          status: string
          to_phone: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          agreement_id?: string | null
          attempts?: number
          body: string
          booking_id?: string | null
          company_id: string
          created_at?: string
          dedupe_key: string
          error?: string | null
          id?: string
          kind: string
          not_before?: string
          organization_id: string
          sent_at?: string | null
          status?: string
          to_phone?: string | null
          updated_at?: string
        }
        Update: {
          agreement_id?: string | null
          attempts?: number
          body?: string
          booking_id?: string | null
          company_id?: string
          created_at?: string
          dedupe_key?: string
          error?: string | null
          id?: string
          kind?: string
          not_before?: string
          organization_id?: string
          sent_at?: string | null
          status?: string
          to_phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_plan_messages_agreement_id_fkey"
            columns: ["agreement_id"]
            referencedRelation: "service_agreements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_plan_messages_booking_id_fkey"
            columns: ["booking_id"]
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_plan_messages_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "service_plan_messages_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      service_plan_runs: {
        Row: {
          company_id: string
          created_at: string
          kind: string
          run_key: string
        }
        ComputedFields: never
        Insert: {
          company_id: string
          created_at?: string
          kind: string
          run_key: string
        }
        Update: {
          company_id?: string
          created_at?: string
          kind?: string
          run_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_plan_runs_company_id_fkey"
            columns: ["company_id"]
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      service_plans: {
        Row: {
          active: boolean
          billing: string
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          duration_minutes: number
          id: string
          included: Json
          name: string
          organization_id: string
          price_cents: number
          time_of_day: string
          updated_at: string
          visit_months: number[]
          week_of_month: number
          weekday: number
        }
        ComputedFields: never
        Insert: {
          active?: boolean
          billing: string
          company_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_minutes?: number
          id?: string
          included?: Json
          name: string
          organization_id: string
          price_cents: number
          time_of_day?: string
          updated_at?: string
          visit_months: number[]
          week_of_month?: number
          weekday?: number
        }
        Update: {
          active?: boolean
          billing?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_minutes?: number
          id?: string
          included?: Json
          name?: string
          organization_id?: string
          price_cents?: number
          time_of_day?: string
          updated_at?: string
          visit_months?: number[]
          week_of_month?: number
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_plans_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "service_plans_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_plans_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "service_plans_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
          {
            foreignKeyName: "service_plans_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      setup_intakes: {
        Row: {
          answers: Json
          company_id: string
          created_at: string
          email_sent_at: string | null
          enrich_attempts: number
          enriched_at: string | null
          enrichment: Json
          id: string
          last_error: string | null
          opened_at: string | null
          organization_id: string
          send_attempts: number
          sent_at: string | null
          sms_sent_at: string | null
          status: string
          submitted_at: string | null
          token: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          answers?: Json
          company_id: string
          created_at?: string
          email_sent_at?: string | null
          enrich_attempts?: number
          enriched_at?: string | null
          enrichment?: Json
          id?: string
          last_error?: string | null
          opened_at?: string | null
          organization_id: string
          send_attempts?: number
          sent_at?: string | null
          sms_sent_at?: string | null
          status?: string
          submitted_at?: string | null
          token: string
          updated_at?: string
        }
        Update: {
          answers?: Json
          company_id?: string
          created_at?: string
          email_sent_at?: string | null
          enrich_attempts?: number
          enriched_at?: string | null
          enrichment?: Json
          id?: string
          last_error?: string | null
          opened_at?: string | null
          organization_id?: string
          send_attempts?: number
          sent_at?: string | null
          sms_sent_at?: string | null
          status?: string
          submitted_at?: string | null
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "setup_intakes_company_id_fkey"
            columns: ["company_id"]
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "setup_intakes_company_org_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "setup_intakes_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_conversations: {
        Row: {
          ai_turns: number
          collected: Json
          company_id: string
          contact_id: string
          created_at: string
          id: string
          last_ai_reply_at: string | null
          last_error: string | null
          last_handled_inbound_at: string | null
          last_inbound_at: string | null
          lock_token: string | null
          lock_until: string
          organization_id: string
          owner_takeover_at: string | null
          recovery_alerted_at: string | null
          recovery_attempts: number
          recovery_inbound_at: string | null
          state: string
          summary: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          ai_turns?: number
          collected?: Json
          company_id: string
          contact_id: string
          created_at?: string
          id?: string
          last_ai_reply_at?: string | null
          last_error?: string | null
          last_handled_inbound_at?: string | null
          last_inbound_at?: string | null
          lock_token?: string | null
          lock_until?: string
          organization_id: string
          owner_takeover_at?: string | null
          recovery_alerted_at?: string | null
          recovery_attempts?: number
          recovery_inbound_at?: string | null
          state?: string
          summary?: string | null
          updated_at?: string
        }
        Update: {
          ai_turns?: number
          collected?: Json
          company_id?: string
          contact_id?: string
          created_at?: string
          id?: string
          last_ai_reply_at?: string | null
          last_error?: string | null
          last_handled_inbound_at?: string | null
          last_inbound_at?: string | null
          lock_token?: string | null
          lock_until?: string
          organization_id?: string
          owner_takeover_at?: string | null
          recovery_alerted_at?: string | null
          recovery_attempts?: number
          recovery_inbound_at?: string | null
          state?: string
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_conversations_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "sms_conversations_contact_id_fkey"
            columns: ["contact_id"]
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_conversations_contact_id_fkey"
            columns: ["contact_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_conversations_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      subcontractors: {
        Row: {
          active: boolean
          business_name: string | null
          company_id: string
          created_at: string
          email: string | null
          id: string
          name: string | null
          notes: string | null
          organization_id: string
          phone_e164: string | null
          trade: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          active?: boolean
          business_name?: string | null
          company_id: string
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          notes?: string | null
          organization_id: string
          phone_e164?: string | null
          trade?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          business_name?: string | null
          company_id?: string
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          notes?: string | null
          organization_id?: string
          phone_e164?: string | null
          trade?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subcontractors_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "subcontractors_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          id: string
          organization_id: string
          plan: string
          status: string
          stripe_subscription_id: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          organization_id: string
          plan: string
          status: string
          stripe_subscription_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          organization_id?: string
          plan?: string
          status?: string
          stripe_subscription_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          account_number: string | null
          active: boolean
          branch: string | null
          company_id: string
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          organization_id: string
          phone: string | null
          preferred: boolean
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          account_number?: string | null
          active?: boolean
          branch?: string | null
          company_id: string
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          organization_id: string
          phone?: string | null
          preferred?: boolean
          updated_at?: string
        }
        Update: {
          account_number?: string | null
          active?: boolean
          branch?: string | null
          company_id?: string
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
          preferred?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "suppliers_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      support_requests: {
        Row: {
          context: Json
          created_at: string
          id: string
          organization_id: string
          profile_id: string | null
          question: string
          reason: string
          requester_email: string | null
          session_id: string | null
          status: string
          transcript: Json
        }
        ComputedFields: never
        Insert: {
          context?: Json
          created_at?: string
          id?: string
          organization_id: string
          profile_id?: string | null
          question: string
          reason?: string
          requester_email?: string | null
          session_id?: string | null
          status?: string
          transcript?: Json
        }
        Update: {
          context?: Json
          created_at?: string
          id?: string
          organization_id?: string
          profile_id?: string | null
          question?: string
          reason?: string
          requester_email?: string | null
          session_id?: string | null
          status?: string
          transcript?: Json
        }
        Relationships: [
          {
            foreignKeyName: "support_requests_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_requests_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_requests_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "support_requests_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to_profile_id: string | null
          booking_id: string | null
          company_id: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_at: string | null
          id: string
          organization_id: string
          priority: Database["public"]["Enums"]["task_priority"]
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
          workflow_id: string | null
        }
        ComputedFields: never
        Insert: {
          assigned_to_profile_id?: string | null
          booking_id?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          organization_id: string
          priority?: Database["public"]["Enums"]["task_priority"]
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
          workflow_id?: string | null
        }
        Update: {
          assigned_to_profile_id?: string | null
          booking_id?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          organization_id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_profile_id_fkey"
            columns: ["assigned_to_profile_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_assigned_to_profile_id_fkey"
            columns: ["assigned_to_profile_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "tasks_assigned_to_profile_id_fkey"
            columns: ["assigned_to_profile_id"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
          {
            foreignKeyName: "tasks_booking_id_organization_id_fkey"
            columns: ["booking_id", "organization_id"]
            referencedRelation: "bookings"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "tasks_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "tasks_contact_id_organization_id_fkey"
            columns: ["contact_id", "organization_id"]
            referencedRelation: "contacts"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "tasks_contact_id_organization_id_fkey"
            columns: ["contact_id", "organization_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
          {
            foreignKeyName: "tasks_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_workflow_id_organization_id_fkey"
            columns: ["workflow_id", "organization_id"]
            referencedRelation: "ui_workflow_list_v"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "tasks_workflow_id_organization_id_fkey"
            columns: ["workflow_id", "organization_id"]
            referencedRelation: "workflows"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      tax_clerk_notices: {
        Row: {
          body: string | null
          company_id: string
          created_at: string
          id: string
          key: string
          kind: string
          organization_id: string
          sent_at: string | null
          status: string
        }
        ComputedFields: never
        Insert: {
          body?: string | null
          company_id: string
          created_at?: string
          id?: string
          key: string
          kind: string
          organization_id: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          body?: string | null
          company_id?: string
          created_at?: string
          id?: string
          key?: string
          kind?: string
          organization_id?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_clerk_notices_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "tax_clerk_notices_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      telnyx_call_insights: {
        Row: {
          booked: boolean | null
          call_outcome: string | null
          caller_phone_last10: string | null
          company_id: string | null
          contact_id: string | null
          created_at: string
          id: string
          lead_id: string | null
          lead_quality: string | null
          organization_id: string | null
          raw_payload: Json | null
          requested_service: string | null
          telnyx_conversation_id: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          booked?: boolean | null
          call_outcome?: string | null
          caller_phone_last10?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          lead_quality?: string | null
          organization_id?: string | null
          raw_payload?: Json | null
          requested_service?: string | null
          telnyx_conversation_id: string
          updated_at?: string
        }
        Update: {
          booked?: boolean | null
          call_outcome?: string | null
          caller_phone_last10?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          lead_quality?: string | null
          organization_id?: string | null
          raw_payload?: Json | null
          requested_service?: string | null
          telnyx_conversation_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "telnyx_call_insights_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "telnyx_call_insights_contact_id_organization_id_fkey"
            columns: ["contact_id", "organization_id"]
            referencedRelation: "contacts"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "telnyx_call_insights_contact_id_organization_id_fkey"
            columns: ["contact_id", "organization_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "telnyx_call_insights_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      telnyx_numbers: {
        Row: {
          active: boolean
          brand_label: string | null
          company_id: string
          created_at: string
          id: string
          organization_id: string
          phone_e164: string
          source_site: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          active?: boolean
          brand_label?: string | null
          company_id: string
          created_at?: string
          id?: string
          organization_id: string
          phone_e164: string
          source_site: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          brand_label?: string | null
          company_id?: string
          created_at?: string
          id?: string
          organization_id?: string
          phone_e164?: string
          source_site?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "telnyx_numbers_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "telnyx_numbers_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      telnyx_quotes: {
        Row: {
          boat_length_ft: number | null
          boat_type: string | null
          caller_phone_last10: string | null
          company_id: string | null
          created_at: string
          currency: string
          deposit_cents: number | null
          engine_type: string | null
          error_message: string | null
          id: string
          line_items: Json
          missing_fields: string[]
          organization_id: string
          quote_total_cents: number | null
          request_payload: Json
          service_type: string | null
          spoken_summary: string | null
          status: string
          telnyx_conversation_id: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          boat_length_ft?: number | null
          boat_type?: string | null
          caller_phone_last10?: string | null
          company_id?: string | null
          created_at?: string
          currency?: string
          deposit_cents?: number | null
          engine_type?: string | null
          error_message?: string | null
          id?: string
          line_items?: Json
          missing_fields?: string[]
          organization_id: string
          quote_total_cents?: number | null
          request_payload: Json
          service_type?: string | null
          spoken_summary?: string | null
          status: string
          telnyx_conversation_id?: string | null
          updated_at?: string
        }
        Update: {
          boat_length_ft?: number | null
          boat_type?: string | null
          caller_phone_last10?: string | null
          company_id?: string | null
          created_at?: string
          currency?: string
          deposit_cents?: number | null
          engine_type?: string | null
          error_message?: string | null
          id?: string
          line_items?: Json
          missing_fields?: string[]
          organization_id?: string
          quote_total_cents?: number | null
          request_payload?: Json
          service_type?: string | null
          spoken_summary?: string | null
          status?: string
          telnyx_conversation_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "telnyx_quotes_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "telnyx_quotes_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          booking_id: string | null
          break_minutes: number
          company_id: string | null
          created_at: string
          created_by: string | null
          ended_at: string | null
          id: string
          notes: string | null
          organization_id: string
          profile_id: string
          source: string
          started_at: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          booking_id?: string | null
          break_minutes?: number
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          profile_id: string
          source?: string
          started_at: string
          updated_at?: string
        }
        Update: {
          booking_id?: string | null
          break_minutes?: number
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          profile_id?: string
          source?: string
          started_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_booking_id_fkey"
            columns: ["booking_id"]
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_company_id_fkey"
            columns: ["company_id"]
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "time_entries_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
          {
            foreignKeyName: "time_entries_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "time_entries_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
        ]
      }
      usage_events: {
        Row: {
          company_id: string | null
          cost_cents: number | null
          created_at: string
          id: string
          kind: string
          metadata: Json | null
          occurred_at: string
          organization_id: string
          provider: string | null
          provider_ref: string | null
          quantity: number
          unit: string
        }
        ComputedFields: never
        Insert: {
          company_id?: string | null
          cost_cents?: number | null
          created_at?: string
          id?: string
          kind: string
          metadata?: Json | null
          occurred_at?: string
          organization_id: string
          provider?: string | null
          provider_ref?: string | null
          quantity: number
          unit: string
        }
        Update: {
          company_id?: string | null
          cost_cents?: number | null
          created_at?: string
          id?: string
          kind?: string
          metadata?: Json | null
          occurred_at?: string
          organization_id?: string
          provider?: string | null
          provider_ref?: string | null
          quantity?: number
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_events_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_service_items: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          every_km: number | null
          every_months: number | null
          id: string
          label: string
          last_done_km: number | null
          last_done_on: string | null
          notes: string | null
          organization_id: string
          updated_at: string
          vehicle_id: string
        }
        ComputedFields: never
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          every_km?: number | null
          every_months?: number | null
          id?: string
          label: string
          last_done_km?: number | null
          last_done_on?: string | null
          notes?: string | null
          organization_id: string
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          every_km?: number | null
          every_months?: number | null
          id?: string
          label?: string
          last_done_km?: number | null
          last_done_on?: string | null
          notes?: string | null
          organization_id?: string
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_service_items_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "vehicle_service_items_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_service_items_vehicle_id_fkey"
            columns: ["vehicle_id"]
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          active: boolean
          avg_km_per_day: number | null
          company_id: string
          created_at: string
          id: string
          make: string | null
          model: string | null
          name: string
          notes: string | null
          odometer_at: string | null
          odometer_km: number | null
          organization_id: string
          plate: string | null
          plate_sticker_due: string | null
          profile_id: string | null
          safety_inspection_due: string | null
          safety_inspection_required: boolean
          updated_at: string
          vin: string | null
          year: number | null
        }
        ComputedFields: never
        Insert: {
          active?: boolean
          avg_km_per_day?: number | null
          company_id: string
          created_at?: string
          id?: string
          make?: string | null
          model?: string | null
          name: string
          notes?: string | null
          odometer_at?: string | null
          odometer_km?: number | null
          organization_id: string
          plate?: string | null
          plate_sticker_due?: string | null
          profile_id?: string | null
          safety_inspection_due?: string | null
          safety_inspection_required?: boolean
          updated_at?: string
          vin?: string | null
          year?: number | null
        }
        Update: {
          active?: boolean
          avg_km_per_day?: number | null
          company_id?: string
          created_at?: string
          id?: string
          make?: string | null
          model?: string | null
          name?: string
          notes?: string | null
          odometer_at?: string | null
          odometer_km?: number | null
          organization_id?: string
          plate?: string | null
          plate_sticker_due?: string | null
          profile_id?: string | null
          safety_inspection_due?: string | null
          safety_inspection_required?: boolean
          updated_at?: string
          vin?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "vehicles_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "vehicles_profile_id_fkey"
            columns: ["profile_id"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
        ]
      }
      voice_numbers: {
        Row: {
          active: boolean
          brand_label: string | null
          company_id: string
          created_at: string
          forwarding_last_test_at: string | null
          forwarding_last_test_result: string | null
          forwarding_verified_at: string | null
          id: string
          mode: string
          organization_id: string
          phone_e164: string
          provider: string
          provider_agent_id: string | null
          provider_number_sid: string | null
        }
        ComputedFields: never
        Insert: {
          active?: boolean
          brand_label?: string | null
          company_id: string
          created_at?: string
          forwarding_last_test_at?: string | null
          forwarding_last_test_result?: string | null
          forwarding_verified_at?: string | null
          id?: string
          mode?: string
          organization_id: string
          phone_e164: string
          provider: string
          provider_agent_id?: string | null
          provider_number_sid?: string | null
        }
        Update: {
          active?: boolean
          brand_label?: string | null
          company_id?: string
          created_at?: string
          forwarding_last_test_at?: string | null
          forwarding_last_test_result?: string | null
          forwarding_verified_at?: string | null
          id?: string
          mode?: string
          organization_id?: string
          phone_e164?: string
          provider?: string
          provider_agent_id?: string | null
          provider_number_sid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voice_numbers_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "voice_numbers_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_overage_charges: {
        Row: {
          attempts: number
          charged_at: string | null
          created_at: string
          detail: Json
          id: string
          included_minutes: number
          last_error: string | null
          month: string
          organization_id: string
          overage_minutes: number
          scope: string
          status: string
          stripe_customer_id: string | null
          stripe_invoice_item_id: string | null
          stripe_price_id: string | null
          updated_at: string
          used_minutes: number
        }
        ComputedFields: never
        Insert: {
          attempts?: number
          charged_at?: string | null
          created_at?: string
          detail?: Json
          id?: string
          included_minutes: number
          last_error?: string | null
          month: string
          organization_id: string
          overage_minutes: number
          scope: string
          status: string
          stripe_customer_id?: string | null
          stripe_invoice_item_id?: string | null
          stripe_price_id?: string | null
          updated_at?: string
          used_minutes: number
        }
        Update: {
          attempts?: number
          charged_at?: string | null
          created_at?: string
          detail?: Json
          id?: string
          included_minutes?: number
          last_error?: string | null
          month?: string
          organization_id?: string
          overage_minutes?: number
          scope?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_invoice_item_id?: string | null
          stripe_price_id?: string | null
          updated_at?: string
          used_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "voice_overage_charges_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist: {
        Row: {
          business: string | null
          created_at: string
          email: string
          id: string
          metadata: Json
          source: string
        }
        ComputedFields: never
        Insert: {
          business?: string | null
          created_at?: string
          email: string
          id?: string
          metadata?: Json
          source?: string
        }
        Update: {
          business?: string | null
          created_at?: string
          email?: string
          id?: string
          metadata?: Json
          source?: string
        }
        Relationships: []
      }
      warranty_terms: {
        Row: {
          company_id: string
          created_at: string
          id: string
          months: number
          organization_id: string
          service_catalog_item_id: string
          terms_text: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          months: number
          organization_id: string
          service_catalog_item_id: string
          terms_text?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          months?: number
          organization_id?: string
          service_catalog_item_id?: string
          terms_text?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "warranty_terms_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "warranty_terms_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranty_terms_service_catalog_item_id_fkey"
            columns: ["service_catalog_item_id"]
            referencedRelation: "service_catalog_items"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_report_sends: {
        Row: {
          channels: string[]
          company_id: string
          created_at: string
          id: string
          last_error: string | null
          metrics: Json
          organization_id: string
          sent_at: string | null
          status: string
          updated_at: string
          week_start: string
        }
        ComputedFields: never
        Insert: {
          channels?: string[]
          company_id: string
          created_at?: string
          id?: string
          last_error?: string | null
          metrics?: Json
          organization_id: string
          sent_at?: string | null
          status?: string
          updated_at?: string
          week_start: string
        }
        Update: {
          channels?: string[]
          company_id?: string
          created_at?: string
          id?: string
          last_error?: string | null
          metrics?: Json
          organization_id?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_report_sends_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "weekly_report_sends_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_event_jobs: {
        Row: {
          activity_event_id: string
          attempt_count: number
          available_at: string
          company_id: string | null
          completed_at: string | null
          created_at: string
          id: string
          last_attempted_at: string | null
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          organization_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["workflow_event_job_status"]
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          activity_event_id: string
          attempt_count?: number
          available_at?: string
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          last_attempted_at?: string | null
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          organization_id: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["workflow_event_job_status"]
          updated_at?: string
        }
        Update: {
          activity_event_id?: string
          attempt_count?: number
          available_at?: string
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          last_attempted_at?: string | null
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          organization_id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["workflow_event_job_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_event_jobs_activity_event_id_organization_id_fkey"
            columns: ["activity_event_id", "organization_id"]
            referencedRelation: "activity_events"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "workflow_event_jobs_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "workflow_event_jobs_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_runs: {
        Row: {
          actions_executed_count: number
          company_id: string | null
          completed_at: string | null
          context_json: Json
          created_at: string
          created_tasks_count: number
          current_step_index: number
          failure_reason: string | null
          id: string
          logs_json: Json
          organization_id: string
          resume_at: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["workflow_run_status"]
          time_saved_seconds: number
          trigger_event_id: string | null
          updated_at: string
          workflow_id: string
        }
        ComputedFields: never
        Insert: {
          actions_executed_count?: number
          company_id?: string | null
          completed_at?: string | null
          context_json?: Json
          created_at?: string
          created_tasks_count?: number
          current_step_index?: number
          failure_reason?: string | null
          id?: string
          logs_json?: Json
          organization_id: string
          resume_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["workflow_run_status"]
          time_saved_seconds?: number
          trigger_event_id?: string | null
          updated_at?: string
          workflow_id: string
        }
        Update: {
          actions_executed_count?: number
          company_id?: string | null
          completed_at?: string | null
          context_json?: Json
          created_at?: string
          created_tasks_count?: number
          current_step_index?: number
          failure_reason?: string | null
          id?: string
          logs_json?: Json
          organization_id?: string
          resume_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["workflow_run_status"]
          time_saved_seconds?: number
          trigger_event_id?: string | null
          updated_at?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_runs_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "workflow_runs_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_runs_trigger_event_id_organization_id_fkey"
            columns: ["trigger_event_id", "organization_id"]
            referencedRelation: "activity_events"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "workflow_runs_workflow_id_organization_id_fkey"
            columns: ["workflow_id", "organization_id"]
            referencedRelation: "ui_workflow_list_v"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "workflow_runs_workflow_id_organization_id_fkey"
            columns: ["workflow_id", "organization_id"]
            referencedRelation: "workflows"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      workflow_schedule_ticks: {
        Row: {
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          id: string
          last_error: string | null
          organization_id: string
          scheduled_for: string
          status: string
          workflow_id: string
        }
        ComputedFields: never
        Insert: {
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          organization_id: string
          scheduled_for: string
          status?: string
          workflow_id: string
        }
        Update: {
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          organization_id?: string
          scheduled_for?: string
          status?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_schedule_ticks_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string | null
          definition: Json
          description: string | null
          id: string
          name: string
          organization_id: string
          slug: string
          status: Database["public"]["Enums"]["workflow_status"]
          trigger_event: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          definition?: Json
          description?: string | null
          id?: string
          name: string
          organization_id: string
          slug: string
          status?: Database["public"]["Enums"]["workflow_status"]
          trigger_event: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          definition?: Json
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          slug?: string
          status?: Database["public"]["Enums"]["workflow_status"]
          trigger_event?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflows_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "workflows_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflows_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "workflows_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
          {
            foreignKeyName: "workflows_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      revenue_attribution_v: {
        Row: {
          approved_at: string | null
          approved_cents: number | null
          auto_generated: boolean | null
          automation_involved: boolean | null
          company_id: string | null
          contact_id: string | null
          deal_kind: string | null
          deposit_cents: number | null
          first_touch_at: string | null
          first_touch_channel: string | null
          first_touch_source: string | null
          invoice_id: string | null
          invoice_paid_cents: number | null
          organization_id: string | null
          paid_at: string | null
          paid_cents: number | null
          quote_id: string | null
          voice_ai_involved: boolean | null
        }
        ComputedFields: never
        Relationships: []
      }
      ui_contact_list_v: {
        Row: {
          bookings_count: number | null
          company_id: string | null
          company_name: string | null
          company_stage: string | null
          email: string | null
          id: string | null
          last_activity_at: string | null
          last_activity_event_type: string | null
          name: string | null
          next_action_detail: string | null
          next_action_due_at: string | null
          next_action_label: string | null
          next_action_type: string | null
          organization_id: string | null
          owner_email: string | null
          owner_full_name: string | null
          owner_id: string | null
          owner_profile_id: string | null
          phone: string | null
          pipeline_value_cents: number | null
          realized_revenue_cents: number | null
          search_text: string | null
          stage: string | null
          upcoming_bookings_count: number | null
        }
        ComputedFields: never
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "contacts_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "contacts_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
        ]
      }
      ui_inbox_v: {
        Row: {
          channel: string | null
          company_id: string | null
          company_name: string | null
          contact_email: string | null
          contact_id: string | null
          contact_name: string | null
          contact_phone: string | null
          last_activity_at: string | null
          last_inbound_at: string | null
          last_outbound_at: string | null
          needs_reply: boolean | null
          organization_id: string | null
          search_text: string | null
          snippet: string | null
          unread: boolean | null
        }
        ComputedFields: never
        Relationships: []
      }
      ui_task_list_v: {
        Row: {
          assigned_to_profile_id: string | null
          assignee_email: string | null
          assignee_full_name: string | null
          assignee_id: string | null
          booking_id: string | null
          booking_title: string | null
          comments_count: number | null
          company_id: string | null
          company_name: string | null
          company_stage: string | null
          contact_company_id: string | null
          contact_company_name: string | null
          contact_company_stage: string | null
          contact_email: string | null
          contact_first_name: string | null
          contact_id: string | null
          contact_last_name: string | null
          contact_phone: string | null
          contact_stage: string | null
          created_at: string | null
          description: string | null
          due_at: string | null
          id: string | null
          is_overdue: boolean | null
          organization_id: string | null
          priority: string | null
          search_text: string | null
          status: string | null
          title: string | null
          workflow_id: string | null
          workflow_name: string | null
        }
        ComputedFields: never
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_profile_id_fkey"
            columns: ["assigned_to_profile_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_assigned_to_profile_id_fkey"
            columns: ["assigned_to_profile_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "tasks_assigned_to_profile_id_fkey"
            columns: ["assigned_to_profile_id"]
            referencedRelation: "ui_task_list_v"
            referencedColumns: ["assignee_id"]
          },
          {
            foreignKeyName: "tasks_booking_id_organization_id_fkey"
            columns: ["booking_id", "organization_id"]
            referencedRelation: "bookings"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "tasks_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "tasks_contact_id_organization_id_fkey"
            columns: ["contact_id", "organization_id"]
            referencedRelation: "contacts"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "tasks_contact_id_organization_id_fkey"
            columns: ["contact_id", "organization_id"]
            referencedRelation: "ui_contact_list_v"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "tasks_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_workflow_id_organization_id_fkey"
            columns: ["workflow_id", "organization_id"]
            referencedRelation: "ui_workflow_list_v"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "tasks_workflow_id_organization_id_fkey"
            columns: ["workflow_id", "organization_id"]
            referencedRelation: "workflows"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      ui_workflow_jobs_v: {
        Row: {
          activity_event_id: string | null
          activity_event_type: string | null
          attempt_count: number | null
          available_at: string | null
          company_id: string | null
          company_name: string | null
          company_stage: string | null
          completed_at: string | null
          created_at: string | null
          id: string | null
          last_attempted_at: string | null
          last_error: string | null
          locked_at: string | null
          organization_id: string | null
          status: string | null
        }
        ComputedFields: never
        Relationships: [
          {
            foreignKeyName: "workflow_event_jobs_activity_event_id_organization_id_fkey"
            columns: ["activity_event_id", "organization_id"]
            referencedRelation: "activity_events"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "workflow_event_jobs_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "workflow_event_jobs_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ui_workflow_list_v: {
        Row: {
          company_id: string | null
          company_name: string | null
          company_stage: string | null
          created_at: string | null
          description: string | null
          failed_runs: number | null
          id: string | null
          last_run_at: string | null
          last_run_status: string | null
          name: string | null
          organization_id: string | null
          recent_runs_count: number | null
          status: string | null
          successful_runs: number | null
          total_runs: number | null
          trigger_type: string | null
        }
        ComputedFields: never
        Relationships: [
          {
            foreignKeyName: "workflows_company_id_organization_id_fkey"
            columns: ["company_id", "organization_id"]
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "workflows_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_monthly_v: {
        Row: {
          company_id: string | null
          cost_cents: number | null
          kind: string | null
          month: string | null
          organization_id: string | null
          quantity: number | null
        }
        ComputedFields: never
        Relationships: [
          {
            foreignKeyName: "usage_events_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      billable_expenses_for_booking: {
        Args: { p_booking_id: string }
        Returns: {
          amount_cents: number
          category: string
          description: string
          id: string
          spent_on: string
          tax_cents: number
          vendor: string
        }[]
      }
      claim_accounting_sync_jobs: {
        Args: { p_limit?: number; p_stale_after_seconds?: number }
        Returns: {
          attempts: number
          available_at: string
          company_id: string
          created_at: string
          detail: string | null
          done_at: string | null
          entity_id: string
          entity_type: string
          id: string
          last_error: string | null
          locked_at: string | null
          max_attempts: number
          organization_id: string
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "accounting_sync_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_accounting_token_refresh: {
        Args: { p_company_id: string; p_stale_after_seconds?: number }
        Returns: boolean
      }
      claim_billing_event_jobs: {
        Args: {
          p_limit?: number
          p_stale_after_seconds?: number
          p_worker_id: string
        }
        Returns: {
          attempt_count: number
          available_at: string
          billing_event_id: string
          completed_at: string | null
          created_at: string
          id: string
          last_attempted_at: string | null
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          started_at: string | null
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "billing_event_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_inbound_webhook_jobs: {
        Args: {
          p_batch?: number
          p_stale_after_seconds?: number
          p_worker_id?: string
        }
        Returns: {
          attempts: number
          claimed_at: string | null
          claimed_by: string | null
          company_id: string | null
          created_at: string
          external_id: string
          id: string
          last_error: string | null
          max_attempts: number
          organization_id: string | null
          payload: Json
          provider: string
          run_at: string
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "inbound_webhook_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_waiting_workflow_runs: {
        Args: { p_batch?: number; p_stale_after_seconds?: number }
        Returns: {
          actions_executed_count: number
          company_id: string | null
          completed_at: string | null
          context_json: Json
          created_at: string
          created_tasks_count: number
          current_step_index: number
          failure_reason: string | null
          id: string
          logs_json: Json
          organization_id: string
          resume_at: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["workflow_run_status"]
          time_saved_seconds: number
          trigger_event_id: string | null
          updated_at: string
          workflow_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "workflow_runs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_workflow_event_jobs: {
        Args: {
          p_limit?: number
          p_stale_after_seconds?: number
          p_worker_id: string
        }
        Returns: {
          activity_event_id: string
          attempt_count: number
          available_at: string
          company_id: string | null
          completed_at: string | null
          created_at: string
          id: string
          last_attempted_at: string | null
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          organization_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["workflow_event_job_status"]
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "workflow_event_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_workflow_schedule_ticks: {
        Args: {
          p_batch?: number
          p_stale_after_seconds?: number
          p_worker_id?: string
        }
        Returns: {
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          id: string
          last_error: string | null
          organization_id: string
          scheduled_for: string
          status: string
          workflow_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "workflow_schedule_ticks"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      close_job_time_entries: {
        Args: { p_booking_id: string }
        Returns: number
      }
      consume_rate_limit: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number }
        Returns: boolean
      }
      dearmor: { Args: { "": string }; Returns: string }
      enqueue_accounting_sync: {
        Args: {
          p_company_id: string
          p_entity_id: string
          p_entity_type: string
        }
        Returns: undefined
      }
      gen_random_uuid: { Args: Record<PropertyKey, never>; Returns: string }
      gen_salt: { Args: { "": string }; Returns: string }
      is_client_role: { Args: Record<PropertyKey, never>; Returns: boolean }
      is_organization_admin: {
        Args: { target_organization_id: string }
        Returns: boolean
      }
      is_organization_member: {
        Args: { target_organization_id: string }
        Returns: boolean
      }
      is_organization_owner: {
        Args: { target_organization_id: string }
        Returns: boolean
      }
      mark_expenses_billed: {
        Args: { p_expense_ids: string[]; p_invoice_id: string }
        Returns: number
      }
      membership_role_rank: {
        Args: { r: Database["public"]["Enums"]["membership_role"] }
        Returns: number
      }
      next_invoice_number: { Args: { p_company_id: string }; Returns: string }
      next_quote_number: {
        Args: { p_organization_id: string }
        Returns: string
      }
      note_legacy_usage: {
        Args: {
          p_count?: number
          p_key: string
          p_kind: string
          p_sample?: string
        }
        Returns: undefined
      }
      pgp_armor_headers: {
        Args: { "": string }
        Returns: Record<string, unknown>[]
      }
      record_billing_event: {
        Args: {
          p_organization_id?: string
          p_payload: Json
          p_stripe_event_id: string
          p_type: string
        }
        Returns: string
      }
      record_invoice_email_open: {
        Args: { p_dedupe_seconds?: number; p_invoice_id: string }
        Returns: {
          counted: boolean
          first_open: boolean
          open_count: number
        }[]
      }
      record_invoice_view: {
        Args: { p_dedupe_seconds?: number; p_invoice_id: string }
        Returns: {
          counted: boolean
          first_view: boolean
          view_count: number
        }[]
      }
      record_review_click: {
        Args: { p_token: string }
        Returns: {
          fallback_url: string
          review_url: string
        }[]
      }
      refresh_invoice_balance: {
        Args: { p_invoice_id: string }
        Returns: {
          amount_paid_cents: number
          balance_due_cents: number
          bill_to: Json
          booking_id: string | null
          company_id: string
          contact_id: string | null
          created_at: string
          created_by: string | null
          credit_cents: number
          currency: string
          customer_account_id: string | null
          due_date: string | null
          email_open_count: number
          first_email_opened_at: string | null
          first_viewed_at: string | null
          id: string
          import_batch_id: string | null
          import_hold: boolean
          import_key: string | null
          imported_at: string | null
          internal_notes: string | null
          invoice_number: string | null
          issue_date: string | null
          last_email_opened_at: string | null
          last_reminder_at: string | null
          last_viewed_at: string | null
          line_items: Json
          notes: string | null
          organization_id: string
          paid_at: string | null
          paid_notified_at: string | null
          payment_terms_days: number
          pending_payment_cents: number
          public_token: string
          quote_id: string | null
          reminder_count: number
          reminders_paused: boolean
          sent_at: string | null
          status: string
          stripe_checkout_session_id: string | null
          subtotal_cents: number
          tax_cents: number
          tax_rate_bps: number
          title: string | null
          total_cents: number
          updated_at: string
          view_count: number
          void_reason: string | null
          voided_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      resolve_trace_entity: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_organization_id: string
        }
        Returns: {
          company_id: string
          entity_exists: boolean
        }[]
      }
      show_limit: { Args: Record<PropertyKey, never>; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      time_entry_in_locked_period: {
        Args: { p_company: string; p_org: string; p_started_at: string }
        Returns: boolean
      }
      ui_activity_feed: {
        Args: {
          p_before_ts?: string
          p_company_id?: string
          p_limit?: number
          p_org_id: string
        }
        Returns: {
          actor_user_id: string | null
          company_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          event_type: string
          id: string
          metadata_json: Json
          occurred_at: string
          organization_id: string
          related_entity_id: string | null
          related_entity_type: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "activity_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      ui_attribution_summary: {
        Args: {
          p_company_id?: string
          p_from?: string
          p_org_id: string
          p_to?: string
        }
        Returns: {
          approved_cents_total: number
          automation_approved_cents: number
          automation_count: number
          automation_paid_cents: number
          by_channel: Json
          by_source: Json
          estimated_time_saved_seconds: number
          paid_cents_total: number
          quotes_count: number
          voice_ai_approved_cents: number
          voice_ai_count: number
          voice_ai_paid_cents: number
        }[]
      }
      ui_automation_impact: {
        Args: { p_company_id?: string; p_org_id: string; p_since_ts?: string }
        Returns: {
          estimated_time_saved_seconds: number
          failed_jobs_count: number
          successful_runs: number
          tasks_auto_created: number
          total_workflow_runs: number
        }[]
      }
      ui_calendar_bookings: {
        Args: {
          p_company_id?: string
          p_from_ts?: string
          p_org_id: string
          p_to_ts?: string
        }
        Returns: {
          assigned_profile_ids: string[]
          company_id: string
          company_name: string
          company_stage: string
          contact_company_id: string
          contact_company_name: string
          contact_company_stage: string
          contact_email: string
          contact_id: string
          contact_name: string
          contact_phone: string
          contact_stage: string
          description: string
          duration_minutes: number
          highest_priority: string
          id: string
          revenue_cents: number
          scheduled_for: string
          status: string
          task_count: number
          title: string
        }[]
      }
      ui_contact_detail: {
        Args: { p_contact_id: string; p_org_id: string }
        Returns: Json
      }
      ui_conversation_thread: {
        Args: {
          p_before_ts?: string
          p_contact_id: string
          p_limit?: number
          p_org_id: string
        }
        Returns: {
          body: string
          channel: string
          direction: string
          id: string
          kind: string
          metadata: Json
          occurred_at: string
          status: string
          title: string
        }[]
      }
      ui_dashboard_summary: {
        Args: { p_company_id?: string; p_org_id: string }
        Returns: {
          active_workflow_count: number
          failed_workflow_job_count: number
          new_lead_count: number
          overdue_task_count: number
          revenue_today_cents: number
          revenue_week_cents: number
          today_booking_count: number
          upcoming_booking_count: number
          urgent_task_count: number
        }[]
      }
      ui_task_detail: {
        Args: { p_org_id: string; p_task_id: string }
        Returns: Json
      }
      ui_value_cents: { Args: { p: Json }; Returns: number }
      ui_workflow_detail: {
        Args: { p_org_id: string; p_workflow_id: string }
        Returns: Json
      }
    }
    Enums: {
      booking_status:
        | "pending"
        | "confirmed"
        | "completed"
        | "cancelled"
        | "no_show"
      comment_entity_type:
        | "company"
        | "contact"
        | "booking"
        | "task"
        | "workflow"
        | "workflow_run"
        | "activity_event"
      company_role: "lead" | "member" | "viewer"
      company_stage: "prospect" | "active" | "paused" | "archived"
      contact_stage: "lead" | "qualified" | "active" | "closed"
      membership_role: "owner" | "admin" | "member"
      task_priority: "low" | "medium" | "high" | "urgent"
      task_status: "todo" | "in_progress" | "blocked" | "completed"
      workflow_event_job_status: "pending" | "running" | "completed" | "failed"
      workflow_run_status:
        | "pending"
        | "running"
        | "completed"
        | "failed"
        | "waiting"
      workflow_status: "draft" | "active" | "paused" | "archived"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database["public"];

export type TableName = keyof PublicSchema["Tables"];
export type EnumName = keyof PublicSchema["Enums"];

export type Tables<T extends TableName> = PublicSchema["Tables"][T]["Row"];
export type Inserts<T extends TableName> = PublicSchema["Tables"][T]["Insert"];
export type Updates<T extends TableName> = PublicSchema["Tables"][T]["Update"];
export type DbEnum<T extends EnumName> = PublicSchema["Enums"][T];
