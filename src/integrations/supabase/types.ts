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
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      consultants: {
        Row: {
          address: string | null
          commercial_registration_no: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          status: Database["public"]["Enums"]["record_status"]
          tax_registration_no: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address?: string | null
          commercial_registration_no?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          status?: Database["public"]["Enums"]["record_status"]
          tax_registration_no?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address?: string | null
          commercial_registration_no?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          status?: Database["public"]["Enums"]["record_status"]
          tax_registration_no?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      deployment_lines: {
        Row: {
          allocation_pct: number
          billed_project_id: string | null
          created_at: string
          derived_cost: number | null
          derived_monthly_rate: number | null
          employee_id: string
          id: string
          notes: string | null
          po_id: string | null
          po_item_id: string | null
          so_id: string | null
          submission_id: string
          updated_at: string
          worked_project_id: string | null
        }
        Insert: {
          allocation_pct?: number
          billed_project_id?: string | null
          created_at?: string
          derived_cost?: number | null
          derived_monthly_rate?: number | null
          employee_id: string
          id?: string
          notes?: string | null
          po_id?: string | null
          po_item_id?: string | null
          so_id?: string | null
          submission_id: string
          updated_at?: string
          worked_project_id?: string | null
        }
        Update: {
          allocation_pct?: number
          billed_project_id?: string | null
          created_at?: string
          derived_cost?: number | null
          derived_monthly_rate?: number | null
          employee_id?: string
          id?: string
          notes?: string | null
          po_id?: string | null
          po_item_id?: string | null
          so_id?: string | null
          submission_id?: string
          updated_at?: string
          worked_project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deployment_lines_billed_project_id_fkey"
            columns: ["billed_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deployment_lines_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deployment_lines_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deployment_lines_po_item_id_fkey"
            columns: ["po_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deployment_lines_so_id_fkey"
            columns: ["so_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deployment_lines_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "deployment_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deployment_lines_worked_project_id_fkey"
            columns: ["worked_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      deployment_submissions: {
        Row: {
          consultant_id: string
          created_at: string
          created_by: string | null
          id: string
          month: string
          period_locked_flag: boolean | null
          reviewed_by: string | null
          reviewed_on: string | null
          reviewer_comments: string | null
          revision_no: number
          revision_reason: string | null
          schedule_type: Database["public"]["Enums"]["schedule_type"]
          status: Database["public"]["Enums"]["submission_status"]
          submitted_by: string | null
          submitted_on: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          consultant_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          month: string
          period_locked_flag?: boolean | null
          reviewed_by?: string | null
          reviewed_on?: string | null
          reviewer_comments?: string | null
          revision_no?: number
          revision_reason?: string | null
          schedule_type: Database["public"]["Enums"]["schedule_type"]
          status?: Database["public"]["Enums"]["submission_status"]
          submitted_by?: string | null
          submitted_on?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          consultant_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          month?: string
          period_locked_flag?: boolean | null
          reviewed_by?: string | null
          reviewed_on?: string | null
          reviewer_comments?: string | null
          revision_no?: number
          revision_reason?: string | null
          schedule_type?: Database["public"]["Enums"]["schedule_type"]
          status?: Database["public"]["Enums"]["submission_status"]
          submitted_by?: string | null
          submitted_on?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deployment_submissions_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "consultants"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          consultant_id: string
          created_at: string
          created_by: string | null
          employee_name: string
          end_date: string | null
          experience_years: number | null
          id: string
          position_id: string | null
          start_date: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          consultant_id: string
          created_at?: string
          created_by?: string | null
          employee_name: string
          end_date?: string | null
          experience_years?: number | null
          id?: string
          position_id?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          consultant_id?: string
          created_at?: string
          created_by?: string | null
          employee_name?: string
          end_date?: string | null
          experience_years?: number | null
          id?: string
          position_id?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "consultants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
        ]
      }
      framework_agreements: {
        Row: {
          consultant_id: string
          created_at: string
          created_by: string | null
          end_date: string | null
          framework_agreement_no: string
          id: string
          start_date: string | null
          status: Database["public"]["Enums"]["record_status"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          consultant_id: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          framework_agreement_no: string
          id?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          consultant_id?: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          framework_agreement_no?: string
          id?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "framework_agreements_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "consultants"
            referencedColumns: ["id"]
          },
        ]
      }
      group_permissions: {
        Row: {
          group_id: string
          id: string
          module_name: string
          permission: Database["public"]["Enums"]["permission_level"]
        }
        Insert: {
          group_id: string
          id?: string
          module_name: string
          permission?: Database["public"]["Enums"]["permission_level"]
        }
        Update: {
          group_id?: string
          id?: string
          module_name?: string
          permission?: Database["public"]["Enums"]["permission_level"]
        }
        Relationships: [
          {
            foreignKeyName: "group_permissions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          consultant_id: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          updated_at: string
          visibility_mode: Database["public"]["Enums"]["visibility_mode"]
        }
        Insert: {
          consultant_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string
          visibility_mode?: Database["public"]["Enums"]["visibility_mode"]
        }
        Update: {
          consultant_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string
          visibility_mode?: Database["public"]["Enums"]["visibility_mode"]
        }
        Relationships: [
          {
            foreignKeyName: "groups_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "consultants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          billed_amount_no_vat: number | null
          check_flag: boolean | null
          consultant_id: string
          created_at: string
          created_by: string | null
          cum_billed_amount_no_vat: number | null
          description: string | null
          id: string
          invoice_month: string
          invoice_number: string
          paid_amount: number | null
          po_id: string | null
          po_item_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          billed_amount_no_vat?: number | null
          check_flag?: boolean | null
          consultant_id: string
          created_at?: string
          created_by?: string | null
          cum_billed_amount_no_vat?: number | null
          description?: string | null
          id?: string
          invoice_month: string
          invoice_number: string
          paid_amount?: number | null
          po_id?: string | null
          po_item_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          billed_amount_no_vat?: number | null
          check_flag?: boolean | null
          consultant_id?: string
          created_at?: string
          created_by?: string | null
          cum_billed_amount_no_vat?: number | null
          description?: string | null
          id?: string
          invoice_month?: string
          invoice_number?: string
          paid_amount?: number | null
          po_id?: string | null
          po_item_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "consultants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_po_item_id_fkey"
            columns: ["po_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      lookup_values: {
        Row: {
          category: string
          created_at: string
          id: string
          is_active: boolean
          label: string
          sort_order: number
          updated_at: string
          value: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          sort_order?: number
          updated_at?: string
          value: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          sort_order?: number
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          link: string | null
          message: string | null
          read: boolean
          recipient_user_id: string
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          link?: string | null
          message?: string | null
          read?: boolean
          recipient_user_id: string
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          link?: string | null
          message?: string | null
          read?: boolean
          recipient_user_id?: string
          title?: string
        }
        Relationships: []
      }
      period_control: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          id: string
          month: string
          opened_at: string | null
          opened_by: string | null
          status: Database["public"]["Enums"]["period_status"]
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          month: string
          opened_at?: string | null
          opened_by?: string | null
          status?: Database["public"]["Enums"]["period_status"]
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          month?: string
          opened_at?: string | null
          opened_by?: string | null
          status?: Database["public"]["Enums"]["period_status"]
          updated_at?: string
        }
        Relationships: []
      }
      positions: {
        Row: {
          consultant_id: string
          created_at: string
          created_by: string | null
          effective_from: string | null
          effective_to: string | null
          id: string
          notes: string | null
          position_name: string
          so_id: string | null
          total_years_of_exp: number | null
          updated_at: string
          updated_by: string | null
          year_1_rate: number | null
          year_2_rate: number | null
          year_3_rate: number | null
          year_4_rate: number | null
          year_5_rate: number | null
        }
        Insert: {
          consultant_id: string
          created_at?: string
          created_by?: string | null
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          notes?: string | null
          position_name: string
          so_id?: string | null
          total_years_of_exp?: number | null
          updated_at?: string
          updated_by?: string | null
          year_1_rate?: number | null
          year_2_rate?: number | null
          year_3_rate?: number | null
          year_4_rate?: number | null
          year_5_rate?: number | null
        }
        Update: {
          consultant_id?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          notes?: string | null
          position_name?: string
          so_id?: string | null
          total_years_of_exp?: number | null
          updated_at?: string
          updated_by?: string | null
          year_1_rate?: number | null
          year_2_rate?: number | null
          year_3_rate?: number | null
          year_4_rate?: number | null
          year_5_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "positions_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "consultants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_so_id_fkey"
            columns: ["so_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          consultant_id: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          status: Database["public"]["Enums"]["record_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          consultant_id?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          consultant_id?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "consultants"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          actual_pmc_to_date: number | null
          classification: string | null
          created_at: string
          created_by: string | null
          end_date: string | null
          entity: string | null
          id: string
          latest_budget: number | null
          latest_pmc_budget: number | null
          portfolio: string | null
          previous_pmc_actual: number | null
          previous_pmc_budget: number | null
          project_name: string
          project_type: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["record_status"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          actual_pmc_to_date?: number | null
          classification?: string | null
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          entity?: string | null
          id?: string
          latest_budget?: number | null
          latest_pmc_budget?: number | null
          portfolio?: string | null
          previous_pmc_actual?: number | null
          previous_pmc_budget?: number | null
          project_name: string
          project_type?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          actual_pmc_to_date?: number | null
          classification?: string | null
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          entity?: string | null
          id?: string
          latest_budget?: number | null
          latest_pmc_budget?: number | null
          portfolio?: string | null
          previous_pmc_actual?: number | null
          previous_pmc_budget?: number | null
          project_name?: string
          project_type?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      purchase_order_items: {
        Row: {
          amount: number | null
          created_at: string
          id: string
          invoiced_to_date: number | null
          latest_invoice_month: string | null
          po_id: string
          po_item_ref: string | null
          project_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          id?: string
          invoiced_to_date?: number | null
          latest_invoice_month?: string | null
          po_id: string
          po_item_ref?: string | null
          project_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          id?: string
          invoiced_to_date?: number | null
          latest_invoice_month?: string | null
          po_id?: string
          po_item_ref?: string | null
          project_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          comments: string | null
          consultant_id: string
          created_at: string
          created_by: string | null
          id: string
          po_end_date: string | null
          po_number: string
          po_reference: string | null
          po_start_date: string | null
          po_value: number | null
          portfolio: string | null
          revision_number: number | null
          so_id: string | null
          status: Database["public"]["Enums"]["record_status"]
          type: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          comments?: string | null
          consultant_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          po_end_date?: string | null
          po_number: string
          po_reference?: string | null
          po_start_date?: string | null
          po_value?: number | null
          portfolio?: string | null
          revision_number?: number | null
          so_id?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          type?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          comments?: string | null
          consultant_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          po_end_date?: string | null
          po_number?: string
          po_reference?: string | null
          po_start_date?: string | null
          po_value?: number | null
          portfolio?: string | null
          revision_number?: number | null
          so_id?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          type?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "consultants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_so_id_fkey"
            columns: ["so_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      service_orders: {
        Row: {
          comments: string | null
          consultant_id: string
          created_at: string
          created_by: string | null
          framework_id: string | null
          id: string
          so_end_date: string | null
          so_number: string
          so_start_date: string | null
          so_value: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          comments?: string | null
          consultant_id: string
          created_at?: string
          created_by?: string | null
          framework_id?: string | null
          id?: string
          so_end_date?: string | null
          so_number: string
          so_start_date?: string | null
          so_value?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          comments?: string | null
          consultant_id?: string
          created_at?: string
          created_by?: string | null
          framework_id?: string | null
          id?: string
          so_end_date?: string | null
          so_number?: string
          so_start_date?: string | null
          so_value?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_orders_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "consultants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_framework_id_fkey"
            columns: ["framework_id"]
            isOneToOne: false
            referencedRelation: "framework_agreements"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          group_id: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_config: {
        Row: {
          apply_scope: Database["public"]["Enums"]["visibility_mode"]
          created_at: string
          enabled: boolean
          id: string
          schedule_type: Database["public"]["Enums"]["schedule_type"]
          step1_role: Database["public"]["Enums"]["app_role"]
          step2_role: Database["public"]["Enums"]["app_role"]
          step3_role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          apply_scope?: Database["public"]["Enums"]["visibility_mode"]
          created_at?: string
          enabled?: boolean
          id?: string
          schedule_type: Database["public"]["Enums"]["schedule_type"]
          step1_role?: Database["public"]["Enums"]["app_role"]
          step2_role?: Database["public"]["Enums"]["app_role"]
          step3_role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          apply_scope?: Database["public"]["Enums"]["visibility_mode"]
          created_at?: string
          enabled?: boolean
          id?: string
          schedule_type?: Database["public"]["Enums"]["schedule_type"]
          step1_role?: Database["public"]["Enums"]["app_role"]
          step2_role?: Database["public"]["Enums"]["app_role"]
          step3_role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_consultant: {
        Args: { target_consultant_id: string }
        Returns: boolean
      }
      get_po_consultant_id: { Args: { p_po_id: string }; Returns: string }
      get_submission_consultant_id: {
        Args: { p_submission_id: string }
        Returns: string
      }
      get_user_consultant_id: { Args: never; Returns: string }
      get_user_profile_id: { Args: never; Returns: string }
      has_module_permission: {
        Args: {
          p_level: Database["public"]["Enums"]["permission_level"]
          p_module: string
        }
        Returns: boolean
      }
      is_superadmin: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role:
        | "superadmin"
        | "admin"
        | "pmc_user"
        | "pmc_reviewer"
        | "aldar_team"
        | "viewer"
      invoice_status: "paid" | "pending" | "cancelled"
      period_status: "open" | "closed" | "locked"
      permission_level: "no_access" | "read" | "modify"
      record_status: "active" | "inactive"
      schedule_type: "baseline" | "actual" | "forecast" | "workload"
      submission_status:
        | "draft"
        | "submitted"
        | "in_review"
        | "approved"
        | "rejected"
        | "returned"
      visibility_mode: "own_company_only" | "see_all_companies"
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
      app_role: [
        "superadmin",
        "admin",
        "pmc_user",
        "pmc_reviewer",
        "aldar_team",
        "viewer",
      ],
      invoice_status: ["paid", "pending", "cancelled"],
      period_status: ["open", "closed", "locked"],
      permission_level: ["no_access", "read", "modify"],
      record_status: ["active", "inactive"],
      schedule_type: ["baseline", "actual", "forecast", "workload"],
      submission_status: [
        "draft",
        "submitted",
        "in_review",
        "approved",
        "rejected",
        "returned",
      ],
      visibility_mode: ["own_company_only", "see_all_companies"],
    },
  },
} as const
