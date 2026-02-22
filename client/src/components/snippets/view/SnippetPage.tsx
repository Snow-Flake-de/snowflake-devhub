import React from 'react';
import AuthAwareSnippetView from './common/AuthAwareSnippetPage';

const SnippetPage: React.FC = () => {
  return <AuthAwareSnippetView />;
};

export default SnippetPage;