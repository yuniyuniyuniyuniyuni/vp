// src/pages/GroupSelectPage.jsx

import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';

function GroupSelectPage() {
  const [userData, setUserData] = useState(null);
  const navigate = useNavigate();

  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupPrivacy, setNewGroupPrivacy] = useState('public');
  const [newGroupPassword, setNewGroupPassword] = useState('');

  const [passwordModalTarget, setPasswordModalTarget] = useState(null); // null이 아니면 모달 열림
  const [passwordInput, setPasswordInput] = useState('');

  useEffect(() => {
    const fetchUserData = async () => {
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        setUserData({
          id: user.id,
          name: user.user_metadata.name || user.email,
          picture: user.user_metadata.picture
        });
      } else {
        console.log("No user found, redirecting to home.");
        navigate('/');
      }
    };

    fetchUserData();
    fetchGroups();
  }, [navigate]);

  const fetchGroups = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('groups')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching groups:', error);
      setError(error.message);
    } else {
      setGroups(data);
    }
    setLoading(false);
  };
  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Error logging out:", error.message);
    }
    navigate('/');
  };

  const handleGoBack = () => {
    navigate('/select');
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault(); 

    if (!newGroupName.trim()) {
      alert('그룹 이름을 입력해주세요.');
      return;
    }
    if (newGroupPrivacy === 'private' && !newGroupPassword.trim()) {
      alert('비공개방은 비밀번호를 입력해야 합니다.');
      return;
    }

    if (!userData) {
      alert('로그인이 필요합니다.');
      return;
    }
    const newGroup = { 
      name: newGroupName, 
      privacy_status: newGroupPrivacy, 
      created_by: userData.id,
      // 비공개일 때만 password를 설정, 공개면 null
      password: newGroupPrivacy === 'private' ? newGroupPassword : null 
    };

    const { data, error } = await supabase
      .from('groups')
      .insert([newGroup])
      .select(); 

    if (error) {
      console.error('Error creating group:', error);
      alert(`그룹 생성 실패: ${error.message}`);
    } else {
      alert('그룹이 성공적으로 생성되었습니다!');
      setIsCreateModalOpen(false); // 모달 닫기
      setNewGroupName(''); // 폼 초기화
      setNewGroupPrivacy('public');
      setNewGroupPassword(''); // [추가] 비밀번호 폼 초기화
      setGroups([data[0], ...groups]);
    }
  };

  const handleDeleteGroup = async (groupId) => {
    // 실수로 삭제하는 것을 방지
    if (!window.confirm("정말로 이 그룹을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) {
      return;
    }

    const { error } = await supabase
      .from('groups')
      .delete()
      .eq('id', groupId);

    if (error) {
      console.error('Error deleting group:', error);
      alert(`그룹 삭제 실패: ${error.message}`);
    } else {
      alert('그룹이 삭제되었습니다.');
      // UI에서도 즉시 그룹을 제거
      setGroups(prevGroups => prevGroups.filter(group => group.id !== groupId));
    }
  };

  const handleJoinClick = (group) => {
    if (group.privacy_status === 'public') {
      // 공개방이면 바로 이동
      navigate(`/group/${group.id}`);
    } else {
      setPasswordModalTarget(group); 
      setPasswordInput(''); 
    }
  };

  const handleSubmitPassword = (e) => {
    e.preventDefault();
    if (!passwordModalTarget) return;
    if (passwordInput === passwordModalTarget.password) {
      alert('비밀번호가 일치합니다. 그룹으로 이동합니다.');
      navigate(`/group/${passwordModalTarget.id}`);
      setPasswordModalTarget(null); // 모달 닫기
    } else {
      alert('비밀번호가 틀렸습니다.');
    }
  };

  return (
    <div className="page-layout-gray">
      <header className="page-header-sticky">
        <div className="container">
          <Link to="/" className="logo-lg">
            NODOZE
          </Link>
          {userData && (
            <div className="profile-section">
              <div className="profile-info">
                <div className="user-avatar">
                  {userData.picture && <img src={userData.picture} alt="avatar" />}
                </div>
                <div>
                  <div className="user-name">{userData.name}</div>
                  <button onClick={handleLogout} className="logout-link">
                    로그아웃
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </header>
      <main className="group-select-main container">

        <div className="group-select-header">
          <div className="title-area">
            <h1>그룹 스터디</h1>
            <p>참여하고 싶은 그룹을 찾거나 그룹을 생성해보세요</p>
          </div>
          <div className="btn-group">
            <button onClick={handleGoBack} className="btn btn-secondary">
              뒤로가기
            </button>
            <button 
              onClick={() => setIsCreateModalOpen(true)} 
              className="btn btn-primary btn-create-group"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                <path fillRule="evenodd" d="M12 3.75a.75.75 0 0 1 .75.75v6.75h6.75a.75.75 0 0 1 0 1.5h-6.75v6.75a.75.75 0 0 1-1.5 0v-6.75H4.5a.75.75 0 0 1 0-1.5h6.75V4.5a.75.75 0 0 1 .75-.75Z" clipRule="evenodd" />
              </svg>
              <span>새 그룹 만들기</span>
            </button>
          </div>
        </div>

        <div className="search-bar-container">
          <input
            type="text"
            placeholder="그룹 이름 또는 태그로 검색"
            className="search-bar"
          />
        </div>

        <div className="group-grid">
          {loading && <p>그룹 목록을 불러오는 중...</p>}
          {error && <p style={{ color: 'red' }}>오류: {error}</p>}
          {!loading && !error && groups.length === 0 && (
            <p>그룹이 없습니다</p>
          )}

          {groups.map((group) => (
            <div className="group-card" key={group.id}>
              <div className="group-card-header">
                <h3 className="group-card-title">{group.name}</h3>
                <span className="group-card-privacy">
                  {group.privacy_status === 'public' ? '공개' : '비공개'}
                </span>
              </div>
              

              <div className="group-card-footer">
                <span className="group-card-members">? / 10명</span>
                <div className="card-footer-buttons">
                  {userData && userData.id === group.created_by && (
                    <button
                      onClick={() => handleDeleteGroup(group.id)}
                      className="btn btn-danger-sm"
                    >
                      삭제
                    </button>
                  )}
                  <button 
                    onClick={() => handleJoinClick(group)} 
                    className="btn btn-primary-sm"
                  >
                    참여하기
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    {isCreateModalOpen && (
        <div className="modal-overlay">
          <div className="modal-card">
            <form onSubmit={handleCreateGroup}>
              <h2>새 그룹 만들기</h2>
              
              <div className="form-group">
                <label htmlFor="group-name">모임 이름</label>
                <input
                  id="group-name"
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="그룹 이름을 입력하세요"
                  required
                />
              </div>
              
              <div className="form-group">
                <label>공개/비공개</label>
                <div className="radio-group">
                  <label>
                    <input 
                      type="radio" 
                      value="public" 
                      checked={newGroupPrivacy === 'public'}
                      onChange={(e) => setNewGroupPrivacy(e.target.value)} 
                    /> 
                    공개
                  </label>
                  <label>
                    <input 
                      type="radio" 
                      value="private" 
                      checked={newGroupPrivacy === 'private'}
                      onChange={(e) => setNewGroupPrivacy(e.target.value)} 
                    /> 
                    비공개
                  </label>
                </div>
              </div>

              {newGroupPrivacy === 'private' && (
                <div className="form-group">
                  <label htmlFor="group-password">비밀번호</label>
                  <input
                    id="group-password"
                    type="password"
                    value={newGroupPassword}
                    onChange={(e) => setNewGroupPassword(e.target.value)}
                    placeholder="비밀번호 4자리 이상"
                    minLength="4"
                    required
                  />
                </div>
              )}
              
              <div className="modal-actions">
                <button 
                  type="button" 
                  onClick={() => setIsCreateModalOpen(false)} 
                  className="btn btn-secondary"
                >
                  취소
                </button>
                <button type="submit" className="btn btn-primary">
                  생성하기
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {passwordModalTarget && (
      <div className="modal-overlay">
        <div className="modal-card">
          <form onSubmit={handleSubmitPassword}>
            <h2>비공개 그룹 참여</h2>
            <div className="form-group">
              <label htmlFor="join-password">비밀번호</label>
              <input
                id="join-password"
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="비밀번호를 입력하세요"
                required
                autoFocus
              />
            </div>
            <div className="modal-actions">
              <button 
                type="button" 
                onClick={() => setPasswordModalTarget(null)} 
                className="btn btn-secondary"
              >
                취소
              </button>
              <button type="submit" className="btn btn-primary">
                참여
              </button>
            </div>
          </form>
        </div>
      </div>
    )}
    </div>
  );
}

export default GroupSelectPage;