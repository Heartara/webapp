export const resources = {
 enquiries: ['status','owner_id','closed_reason'],
 contacts: ['name','email_original','phone','preference','source','assigned_to','archived_at'],
 appointments: ['contact_id','service_id','practitioner_id','journey_id','package_id','starts_at','ends_at','status','mode','location_private','change_reason','payment_state'],
 tasks: ['title','owner_id','contact_id','enquiry_id','appointment_id','due_at','status'],
 services: ['name','category','reiki_level','description','duration_minutes','buffer_before','buffer_after','price_minor','status'],
 feedback: ['status','public_text','display_order'],
 client_packages: ['contact_id','service_id','payment_state'],
 client_journeys: ['name','mode','practitioner_id','status'],
 journey_participants: ['journey_id','contact_id','terms_snapshot'],
 journey_meetings: ['journey_id','appointment_id','sequence'],
 rite_completion_events: ['participant_id','rite','meeting_id','received_at'],
 internal_notes: ['contact_id','note_text'],
 practitioner_blocks: ['practitioner_id','starts_at','ends_at','reason'],
 business_settings: ['notification_email','notification_enabled','private_address','retention_policy'],
 staff_users: [], consent_events: [], activity_events: [], notification_outbox: [], appointment_changes: [], package_session_movements: [], package_movement_history: []
};
export const searchFields = {contacts:['name','email_original'],enquiries:['original_message','details->>name','details->>email'],services:['name'],tasks:['title'],feedback:['display_name','public_text']};
export const filters = ['status','owner_id','assigned_to','contact_id','enquiry_id','appointment_id','practitioner_id','journey_id','participant_id','package_id','topic','service_id','submission_id','email_normalised'];
export function pickFields(resource, body) { return Object.fromEntries((resources[resource]||[]).filter(k=>Object.hasOwn(body,k)).map(k=>[k,body[k]])); }
