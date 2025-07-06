// Debug helper for collaboration features
export const debugCollaboration = {
  checkPresence: async (articleId: string) => {
    try {
      const { supabase } = await import('../lib/supabase');
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      console.log('🔍 Current user:', user?.email);
      
      // Check user_presence table
      const { data: presence, error } = await supabase
        .from('user_presence')
        .select('*')
        .eq('article_id', articleId);
        
      if (error) {
        console.error('❌ Error fetching presence:', error);
        return;
      }
      
      console.log('👥 Active users in article:', presence);
      console.log('📊 Total active users:', presence?.length || 0);
      
      // Check if current user is in presence
      if (user && presence) {
        const userPresence = presence.find(p => p.user_id === user.id);
        console.log('🙋 Current user presence:', userPresence || 'Not found');
      }
      
      return presence;
    } catch (error) {
      console.error('❌ Debug error:', error);
    }
  },
  
  testJoinArticle: async (articleId: string) => {
    try {
      const { realtimeCollaboration } = await import('../lib/realtimeCollaboration');
      
      console.log('🚀 Testing join article:', articleId);
      await realtimeCollaboration.joinArticle(articleId, {
        name: 'Test User',
        email: 'test@example.com'
      });
      
      console.log('✅ Successfully joined article');
      
      // Wait a bit and check presence
      setTimeout(async () => {
        const presence = await debugCollaboration.checkPresence(articleId);
        console.log('📍 Presence after join:', presence);
      }, 2000);
      
    } catch (error) {
      console.error('❌ Failed to join article:', error);
    }
  }
};

// Make it available globally for testing
if (typeof window !== 'undefined') {
  (window as any).debugCollab = debugCollaboration;
}