revoke all privileges on table
  public.ai_study_sessions,
  public.ai_study_messages,
  public.ai_study_quizzes,
  public.ai_study_usage
from public, anon, authenticated;

grant select on table
  public.ai_study_sessions,
  public.ai_study_messages,
  public.ai_study_quizzes,
  public.ai_study_usage
to authenticated;
